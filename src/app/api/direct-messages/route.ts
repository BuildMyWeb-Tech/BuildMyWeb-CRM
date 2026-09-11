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
    if (!recipientId) return NextResponse.json({ error: 'recipient_id required' }, { status: 400 })
    if (!msgBody) return NextResponse.json({ error: 'body required' }, { status: 400 })

    const { data, error } = await supabaseAdmin()
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

    return NextResponse.json({ message: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
