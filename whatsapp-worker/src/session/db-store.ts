/**
 * DB-backed session store.
 *
 * Auth state is AES-256-GCM encrypted before storage in
 * whatsapp_session_state.encrypted_state. The table has no RLS policies
 * for normal users — only the service-role client (used here) can write it.
 *
 * This design survives container/process restarts without requiring a
 * persistent filesystem mount, which matters when hosting is unknown.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '../crypto/encryption.js'
import type { WhatsAppSessionStore } from './store.js'
import type { AuthState } from '../provider/adapter.js'
import { logger } from '../logger.js'

export class DbSessionStore implements WhatsAppSessionStore {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly encryptionKeyHex: string,
  ) {}

  async load(whatsappAccountId: string): Promise<AuthState | null> {
    const { data, error } = await this.supabase
      .from('whatsapp_session_state')
      .select('encrypted_state, version')
      .eq('whatsapp_account_id', whatsappAccountId)
      .maybeSingle()

    if (error) {
      logger.error('error', { op: 'session_load', message: error.message })
      return null
    }
    if (!data) {
      logger.info('session_not_found', { whatsappAccountId })
      return null
    }

    try {
      const plain = decrypt(data.encrypted_state, this.encryptionKeyHex)
      const authState = JSON.parse(plain) as AuthState
      logger.info('session_loaded', { whatsappAccountId, version: data.version })
      return authState
    } catch (err) {
      logger.error('error', { op: 'session_decrypt', message: String(err) })
      return null
    }
  }

  async save(whatsappAccountId: string, authState: AuthState): Promise<void> {
    const plain = JSON.stringify(authState)
    const encrypted = encrypt(plain, this.encryptionKeyHex)

    const { error } = await this.supabase
      .from('whatsapp_session_state')
      .upsert(
        {
          whatsapp_account_id: whatsappAccountId,
          encrypted_state: encrypted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'whatsapp_account_id' },
      )

    if (error) {
      logger.error('error', { op: 'session_save', message: error.message })
      return
    }

    logger.info('session_saved', { whatsappAccountId })
  }

  async clear(whatsappAccountId: string): Promise<void> {
    await this.supabase
      .from('whatsapp_session_state')
      .delete()
      .eq('whatsapp_account_id', whatsappAccountId)
    logger.info('session_cleared', { whatsappAccountId })
  }
}
