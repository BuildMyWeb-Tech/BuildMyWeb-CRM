import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

/**
 * GET /api/whatsapp/qr/status
 *
 * Returns the whatsapp_accounts row (provider=qr) for this account.
 * Used by the QR connect UI to poll connection state and display the QR code.
 *
 * The QR data URI is safe to return here: it is temporary pairing data,
 * not authentication credentials. The session/keys live only in the worker.
 *
 * Returns 404 when no QR account has been created yet (pre-connect state).
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('viewer')

    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select(
        'id, account_id, phone_number, display_name, provider, status, connection_state, ' +
        'qr_data_uri, qr_generated_at, last_connected_at, last_disconnected_at, ' +
        'reconnect_attempts, last_error, worker_instance_id, disconnect_requested_at, ' +
        'created_at, updated_at'
      )
      .eq('account_id', accountId)
      .eq('provider', 'qr')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[qr/status] DB error:', error.message)
      return NextResponse.json({ error: 'Failed to load WhatsApp status' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ account: null }, { status: 200 })
    }

    return NextResponse.json({ account: data })
  } catch (error) {
    return toErrorResponse(error)
  }
}
