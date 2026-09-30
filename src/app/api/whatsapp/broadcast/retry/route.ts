/**
 * POST /api/whatsapp/broadcast/retry
 *
 * Retries a failed QR broadcast by resetting its failed outbox jobs back
 * to 'pending' and updating the broadcast status to 'sending'.
 * Max 5 retry attempts total (tracked via broadcast.retry_count).
 */

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

const MAX_RETRIES = 5

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('agent')
    const { broadcast_id } = await request.json()

    if (!broadcast_id || typeof broadcast_id !== 'string') {
      return NextResponse.json({ error: 'broadcast_id is required' }, { status: 400 })
    }

    const admin = supabaseAdmin()

    // Check QR worker liveness (heartbeat within 2 min = alive)
    const { data: qrAccount } = await admin
      .from('whatsapp_accounts')
      .select('connection_state, last_heartbeat_at')
      .eq('account_id', accountId)
      .eq('provider', 'qr')
      .maybeSingle()
    const workerOffline =
      !qrAccount ||
      qrAccount.connection_state !== 'CONNECTED' ||
      !qrAccount.last_heartbeat_at ||
      new Date(qrAccount.last_heartbeat_at).getTime() < Date.now() - 2 * 60 * 1000

    // Verify the broadcast belongs to this account and is failed
    const { data: broadcast, error: bErr } = await admin
      .from('broadcasts')
      .select('id, status, retry_count, total_recipients')
      .eq('id', broadcast_id)
      .eq('account_id', accountId)
      .single()

    if (bErr || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    if (broadcast.status !== 'failed') {
      return NextResponse.json(
        { error: `Cannot retry a broadcast with status '${broadcast.status}'` },
        { status: 400 },
      )
    }

    const retryCount = (broadcast.retry_count as number) ?? 0
    if (retryCount >= MAX_RETRIES) {
      return NextResponse.json(
        { error: `Maximum retry attempts (${MAX_RETRIES}) reached for this broadcast` },
        { status: 400 },
      )
    }

    // Reset failed outbox rows back to pending so the worker picks them up
    const { data: resetRows, error: outboxErr } = await admin
      .from('whatsapp_message_outbox')
      .update({
        status: 'pending',
        attempts: 0,
        max_attempts: MAX_RETRIES,
        error: null,
        locked_at: null,
        locked_by: null,
        processed_at: null,
        scheduled_at: new Date().toISOString(),
      })
      .eq('broadcast_id', broadcast_id)
      .in('status', ['failed', 'cancelled'])
      .select('id')

    if (outboxErr) {
      return NextResponse.json(
        { error: 'Failed to reset outbox jobs: ' + outboxErr.message },
        { status: 500 },
      )
    }

    const retriedCount = resetRows?.length ?? 0

    if (retriedCount === 0) {
      return NextResponse.json(
        { error: 'No failed messages to retry for this broadcast' },
        { status: 400 },
      )
    }

    // Also reset failed broadcast_recipients back to pending so counts update correctly
    await admin
      .from('broadcast_recipients')
      .update({ status: 'pending', error_message: null })
      .eq('broadcast_id', broadcast_id)
      .eq('status', 'failed')

    // Update broadcast: back to 'sending', increment retry_count
    await admin
      .from('broadcasts')
      .update({
        status: 'sending',
        retry_count: retryCount + 1,
        failed_count: 0,
      })
      .eq('id', broadcast_id)

    return NextResponse.json({
      success: true,
      retried: retriedCount,
      attempt: retryCount + 1,
      max_retries: MAX_RETRIES,
      workerOffline,
    })
  } catch (error) {
    console.error('[broadcast-retry] error:', error)
    return toErrorResponse(error)
  }
}
