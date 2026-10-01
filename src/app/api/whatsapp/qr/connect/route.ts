import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * POST /api/whatsapp/qr/connect
 *
 * Ensures a whatsapp_accounts row (provider=qr) exists for this account.
 * Creates one if not present — the worker picks it up via WHATSAPP_ACCOUNT_ID
 * env var and begins connecting, emitting a QR which lands in qr_data_uri.
 *
 * Idempotent: multiple calls return the same row.
 * Admin+ only: creating/managing a WhatsApp connection is a privileged action.
 */
export async function POST() {
  try {
    const { supabase, accountId } = await requireRole('admin')

    // Check for existing QR account.
    const { data: existing } = await supabase
      .from('whatsapp_accounts')
      .select('id, connection_state, status')
      .eq('account_id', accountId)
      .eq('provider', 'qr')
      .maybeSingle()

    if (existing) {
      // If the account exists but is logged-out/disconnected, reset it so
      // the worker generates a fresh QR on next startup.
      const needsReset = ['LOGGED_OUT', 'DISCONNECTED', 'ERROR'].includes(
        existing.connection_state as string,
      )
      if (needsReset) {
        const now = new Date().toISOString()
        const { error: resetErr } = await supabaseAdmin()
          .from('whatsapp_accounts')
          .update({
            connection_state: 'DISCONNECTED',
            status: 'disconnected',
            qr_data_uri: null,
            qr_generated_at: null,
            disconnect_requested_at: null,
            last_error: null,
            reconnect_attempts: 0,
            updated_at: now,
          })
          .eq('id', existing.id)
        if (resetErr) console.warn('[qr/connect] reset error:', resetErr.message)
      }
      return NextResponse.json({ account: existing, created: false })
    }

    // Create a new QR account row using service-role client (bypasses RLS).
    // The worker reads this via its WHATSAPP_ACCOUNT_ID env var.
    const { data: created, error } = await supabaseAdmin()
      .from('whatsapp_accounts')
      .insert({
        account_id: accountId,
        provider: 'qr',
        status: 'disconnected',
        connection_state: 'DISCONNECTED',
      })
      .select('id, connection_state, status')
      .single()

    if (error || !created) {
      console.error('[qr/connect] insert error:', error?.message)
      return NextResponse.json({ error: 'Failed to create WhatsApp account' }, { status: 500 })
    }

    return NextResponse.json({ account: created, created: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
