import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

/**
 * POST /api/whatsapp/qr/disconnect
 *
 * Requests a graceful disconnect of the QR WhatsApp connection.
 * Sets disconnect_requested_at on the whatsapp_accounts row.
 * The worker checks this on every heartbeat and calls provider.logout(),
 * which clears the session so the next connection requires a new QR scan.
 *
 * This is the ONLY way a session should be intentionally destroyed.
 * Worker crashes / network errors do NOT destroy the session.
 */
export async function POST() {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .update({
        disconnect_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('provider', 'qr')
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('[qr/disconnect] update error:', error.message)
      return NextResponse.json({ error: 'Failed to request disconnect' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'No QR WhatsApp account found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
