import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

/**
 * Fires a 'lead_follow_up_due' notification for every client_leads
 * row whose next_follow_up_at has arrived (or passed) and hasn't
 * been notified for yet. Meant to be hit on a schedule (external
 * pinger — same shape as /api/automations/cron), guarded by the
 * same shared secret so operators only manage one.
 *
 * "Not yet notified for yet" = follow_up_notified_at is NULL, or
 * older than next_follow_up_at (covers the case where the lead was
 * notified once, then its follow-up got rescheduled later — see
 * 059_client_leads_extras.sql).
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
    .select('id, account_id, title, allocated_user_id, next_follow_up_at, follow_up_notified_at')
    .in('status', ['in_discussion', 'hold'])
    .not('allocated_user_id', 'is', null)
    .not('next_follow_up_at', 'is', null)
    .lte('next_follow_up_at', nowIso)
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!due || due.length === 0) return NextResponse.json({ processed: 0 })

  let processed = 0
  for (const lead of due) {
    if (lead.follow_up_notified_at && lead.follow_up_notified_at >= lead.next_follow_up_at!) continue

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

    const { error: markError } = await admin
      .from('client_leads')
      .update({ follow_up_notified_at: nowIso })
      .eq('id', lead.id)
    if (markError) console.error('[client-leads cron] mark-notified failed for lead', lead.id, markError)

    processed++
  }

  return NextResponse.json({ processed })
}
