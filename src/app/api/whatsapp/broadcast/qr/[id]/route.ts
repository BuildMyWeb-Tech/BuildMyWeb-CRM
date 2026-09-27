/**
 * GET /api/whatsapp/broadcast/qr/[id]
 *
 * Returns durable aggregate progress for a QR broadcast.
 * Account isolation is enforced — another account's broadcast returns 404.
 *
 * Response shape:
 *   {
 *     broadcast: { id, name, status, provider, scheduledAt, createdAt, ... },
 *     progress: {
 *       total, pending, sent, delivered, read, replied, failed, cancelled,
 *       percentSent, percentDelivered, percentRead
 *     }
 *   }
 */

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: broadcastId } = await params
    const { supabase, accountId } = await requireRole('agent')

    // Fetch broadcast — RLS ensures only own-account rows are returned.
    const { data: broadcast, error: bcErr } = await supabase
      .from('broadcasts')
      .select(
        'id, name, status, provider, scheduled_at, created_at, updated_at, ' +
        'total_recipients, sent_count, delivered_count, read_count, replied_count, ' +
        'failed_count, message_text, media_type, send_interval_ms, whatsapp_account_id',
      )
      .eq('id', broadcastId)
      .eq('account_id', accountId)
      .maybeSingle()

    if (bcErr) {
      return NextResponse.json({ error: 'Failed to fetch broadcast.' }, { status: 500 })
    }
    if (!broadcast) {
      return NextResponse.json({ error: 'Broadcast not found.' }, { status: 404 })
    }
    if (broadcast.provider !== 'qr') {
      return NextResponse.json(
        { error: 'This endpoint is for QR broadcasts only.' },
        { status: 400 },
      )
    }

    // Recipient-level counts — computed from the live table rather than relying
    // solely on the aggregate columns so callers can verify consistency.
    const { data: counts } = await supabase
      .from('broadcast_recipients')
      .select('status')
      .eq('broadcast_id', broadcastId)

    const statusCounts = {
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      failed: 0,
      cancelled: 0,
    }
    for (const row of counts ?? []) {
      const s = row.status as keyof typeof statusCounts
      if (s in statusCounts) statusCounts[s]++
    }

    const total = broadcast.total_recipients ?? 0
    const sent = broadcast.sent_count ?? 0

    const progress = {
      total,
      ...statusCounts,
      percentSent: total > 0 ? Math.round((sent / total) * 100) : 0,
      percentDelivered:
        total > 0 ? Math.round(((broadcast.delivered_count ?? 0) / total) * 100) : 0,
      percentRead:
        total > 0 ? Math.round(((broadcast.read_count ?? 0) / total) * 100) : 0,
    }

    return NextResponse.json({ broadcast, progress })
  } catch (err) {
    return toErrorResponse(err)
  }
}
