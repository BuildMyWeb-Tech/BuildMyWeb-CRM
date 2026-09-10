import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// GET /api/direct-messages/[userId] — full message thread between current user and [userId]
// PATCH /api/direct-messages/[userId] — mark all incoming messages as read

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    const { userId: partnerId } = await params

    const { data, error } = await ctx.supabase
      .from('direct_messages')
      .select('*')
      .eq('account_id', ctx.accountId)
      .or(
        `and(sender_id.eq.${ctx.userId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${ctx.userId})`
      )
      .order('created_at', { ascending: true })

    if (error) throw error
    return NextResponse.json({ messages: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const ctx = await getCurrentAccount()
    if (!ctx.userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    const { userId: partnerId } = await params

    await ctx.supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('account_id', ctx.accountId)
      .eq('sender_id', partnerId)
      .eq('recipient_id', ctx.userId)
      .is('read_at', null)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
