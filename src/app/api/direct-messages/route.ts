import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/direct-messages — list conversation partners (threads) for the current user,
//   with the last message + unread count per thread.
// POST /api/direct-messages — send a DM. Body: { recipient_id, body }

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // Get all messages where I am sender or recipient
    const { data, error } = await ctx.supabase
      .from('direct_messages')
      .select('*')
      .eq('account_id', ctx.accountId)
      .or(`sender_id.eq.${ctx.userId},recipient_id.eq.${ctx.userId}`)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Build thread list: group by the other person
    const threadMap = new Map<string, {
      partner_id: string;
      last_message: string;
      last_at: string;
      unread: number;
    }>()

    for (const msg of data ?? []) {
      const partnerId = msg.sender_id === ctx.userId ? msg.recipient_id : msg.sender_id
      if (!threadMap.has(partnerId)) {
        threadMap.set(partnerId, {
          partner_id: partnerId,
          last_message: msg.body,
          last_at: msg.created_at,
          unread: !msg.read_at && msg.recipient_id === ctx.userId ? 1 : 0,
        })
      } else {
        const t = threadMap.get(partnerId)!
        if (!msg.read_at && msg.recipient_id === ctx.userId) t.unread++
      }
    }

    return NextResponse.json({ threads: Array.from(threadMap.values()) })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const recipientId = typeof body.recipient_id === 'string' ? body.recipient_id : ''
    const msgBody = typeof body.body === 'string' ? body.body.trim() : ''
    const mentionedUserIds: string[] = Array.isArray(body.mention_user_ids)
      ? body.mention_user_ids.filter((v: unknown) => typeof v === 'string')
      : []

    if (!recipientId) return NextResponse.json({ error: 'recipient_id required' }, { status: 400 })
    if (!msgBody) return NextResponse.json({ error: 'body required' }, { status: 400 })

    const admin = supabaseAdmin()

    const { data, error } = await admin
      .from('direct_messages')
      .insert({
        account_id: ctx.accountId,
        sender_id: ctx.userId,
        recipient_id: recipientId,
        body: msgBody,
      })
      .select('*')
      .single()

    if (error) {
      console.error('[direct-messages] send failed:', error)
      const detail = error.message?.includes('schema cache')
        ? 'Direct messages table not found — apply migration 072_crm_automations_direct_messages.sql to your Supabase project'
        : error.message
      return NextResponse.json(
        { error: 'Could not send message', detail, code: error.code },
        { status: 500 },
      )
    }

    // Create mention notifications for each mentioned user (best-effort)
    if (mentionedUserIds.length > 0) {
      const { data: senderProfile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('user_id', ctx.userId)
        .maybeSingle()
      const senderName = senderProfile?.full_name ?? 'Someone'
      const snippet = msgBody.length > 80 ? msgBody.slice(0, 80) + '…' : msgBody

      const notifRows = mentionedUserIds
        .filter((uid) => uid !== ctx.userId)
        .map((uid) => ({
          account_id: ctx.accountId,
          user_id: uid,
          type: 'mentioned',
          category: 'mention',
          actor_user_id: ctx.userId,
          mention_user_id: ctx.userId,
          action_url: '/messages',
          title: `${senderName} mentioned you`,
          body: snippet,
        }))

      if (notifRows.length > 0) {
        await admin.from('notifications').insert(notifRows).then(({ error: ne }) => {
          if (ne) console.warn('[direct-messages] mention notification failed:', ne.message)
        })
      }
    }

    return NextResponse.json({ message: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
