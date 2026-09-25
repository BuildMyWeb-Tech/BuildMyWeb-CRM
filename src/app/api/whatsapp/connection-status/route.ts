/**
 * GET /api/whatsapp/connection-status
 *
 * Provider-agnostic WhatsApp connection status for the authenticated user's
 * account. Returns whether ANY WhatsApp provider (Meta or QR/Baileys) is
 * currently connected and usable.
 *
 * Used by the Inbox page to show/hide the "WhatsApp not connected" banner
 * without needing to know which provider is active.
 *
 * Response shape:
 *   { connected: boolean, provider: "meta"|"qr"|null, phoneNumber: string|null }
 */
import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getWhatsAppConnectionStatus } from '@/lib/whatsapp/connection-status'

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('viewer')
    const status = await getWhatsAppConnectionStatus(supabase, accountId)
    return NextResponse.json(status)
  } catch (err) {
    return toErrorResponse(err)
  }
}
