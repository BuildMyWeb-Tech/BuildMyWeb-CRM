/**
 * Provider-agnostic WhatsApp connection status.
 *
 * The CRM supports two WhatsApp providers:
 *   "meta" — Meta Cloud API (whatsapp_config table, status='connected')
 *   "qr"   — Baileys/linked-device (whatsapp_accounts, connection_state='CONNECTED')
 *
 * This helper answers "is this account's WhatsApp usable right now?" without
 * the caller needing to know which provider is active. It is intentionally
 * read-only and uses the caller-supplied Supabase client so it respects the
 * caller's RLS context (browser = anon/user client, server = service client).
 *
 * Meta-only features (templates, broadcasts, interactive messages) should
 * continue to check whatsapp_config directly — this helper is for the
 * transport-level "can we send/receive at all?" question.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface WhatsAppConnectionStatus {
  /** True only when a provider is BOTH configured AND currently usable. */
  connected: boolean
  /** Which provider is active, or null when nothing is connected. */
  provider: 'meta' | 'qr' | null
  /** Phone number for the connected account, if known. */
  phoneNumber: string | null
  /** The whatsapp_accounts.id for QR, or whatsapp_config.id for Meta. */
  accountRowId: string | null
  /** Raw connection_state string from whatsapp_accounts (QR only). */
  connectionState: string | null
}

const DISCONNECTED: WhatsAppConnectionStatus = {
  connected: false,
  provider: null,
  phoneNumber: null,
  accountRowId: null,
  connectionState: null,
}

/**
 * Check whether any WhatsApp provider is connected for the given CRM account.
 *
 * Priority: if Meta is connected it is returned first (preserves legacy
 * behaviour for accounts that have both).  QR is checked second.
 *
 * @param db      Supabase client scoped to the authenticated user (or service
 *                role for server-side callers).  Must already be scoped so RLS
 *                only returns rows for `accountId`.
 * @param accountId  The CRM account/workspace UUID.
 */
export async function getWhatsAppConnectionStatus(
  db: SupabaseClient,
  accountId: string,
): Promise<WhatsAppConnectionStatus> {
  if (!accountId) return DISCONNECTED

  // ── Meta Cloud API ────────────────────────────────────────────────────────
  const { data: metaConfig } = await db
    .from('whatsapp_config')
    .select('id, phone_number_id, status')
    .eq('account_id', accountId)
    .maybeSingle()

  if (metaConfig?.status === 'connected' && metaConfig.phone_number_id) {
    return {
      connected: true,
      provider: 'meta',
      phoneNumber: metaConfig.phone_number_id ?? null,
      accountRowId: metaConfig.id ?? null,
      connectionState: null,
    }
  }

  // ── QR / Baileys linked-device ────────────────────────────────────────────
  // Only connection_state = 'CONNECTED' is usable. All intermediate states
  // (STARTING, AUTHENTICATING, QR_REQUIRED, PAIRING, RECONNECTING, etc.)
  // mean the session is not yet ready and messages cannot be sent/received.
  const { data: qrAccount } = await db
    .from('whatsapp_accounts')
    .select('id, phone_number, connection_state')
    .eq('account_id', accountId)
    .eq('provider', 'qr')
    .eq('connection_state', 'CONNECTED')
    .maybeSingle()

  if (qrAccount) {
    return {
      connected: true,
      provider: 'qr',
      phoneNumber: qrAccount.phone_number ?? null,
      accountRowId: qrAccount.id,
      connectionState: 'CONNECTED',
    }
  }

  return DISCONNECTED
}
