import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

/**
 * Fires a 'lead_follow_up_due' notification for every client_leads
 * row whose next_follow_up_at has arrived (or passed). Meant to be
 * hit on a schedule (external pinger — same shape as
 * /api/automations/cron), guarded by the same shared secret so
 * operators only manage one.
 *
 * "Already notified, don't repeat" = an UNREAD notification for this
 * lead already exists — so it keeps nagging (one fresh notification
 * per cron tick) for as long as the lead stays overdue AND unread,
 * but goes quiet the moment either becomes false: read it and it's
 * still overdue next tick, you get another one; leave it unread and
 * you won't get duplicates piling up; use the lead's "Mark done"
 * action (clears/reschedules next_follow_up_at) and it drops out of
 * the `due` query entirely, done for real.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const nowIso = new Date().toISOString()

  const { data: due, error } = await admin
    .from('client_leads')
    .select('id, account_id, title, allocated_user_id, next_follow_up_at')
    .in('status', ['in_discussion', 'hold'])
    .not('allocated_user_id', 'is', null)
    .not('next_follow_up_at', 'is', null)
    .lte('next_follow_up_at', nowIso)
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 })

  const { data: unreadExisting, error: existingError } = await admin
    .from('notifications')
    .select('lead_id')
    .eq('type', 'lead_follow_up_due')
    .is('read_at', null)
    .in('lead_id', due.map((l) => l.id))
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  const alreadyNagging = new Set((unreadExisting ?? []).map((n) => n.lead_id))

  let processed = 0
  for (const lead of due) {
    if (alreadyNagging.has(lead.id)) continue

    const { error: notifyError } = await admin.from('notifications').insert({
      account_id: lead.account_id,
      user_id: lead.allocated_user_id,
      type: 'lead_follow_up_due',
      lead_id: lead.id,
      title: 'Lead follow-up due',
      body: `"${lead.title}" is due for follow-up.`,
    })
    if (notifyError) {
      console.error('[client-leads cron] notify failed for lead', lead.id, notifyError)
      continue
    }

    processed++
  }

  return NextResponse.json({ processed })
}
