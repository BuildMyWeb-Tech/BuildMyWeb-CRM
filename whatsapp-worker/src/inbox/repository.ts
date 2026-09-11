/**
 * InboxRepository — worker-side writes to the CRM's messages/conversations/contacts.
 * Uses the service-role Supabase client (bypasses RLS) so the worker can write
 * without a user session. All writes are scoped to the owning account_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InboundMessage } from '../provider/adapter.js'
import { jidToPhone, normalizePhone, phonesMatch, isGroupJid } from './phone-utils.js'
import { logger } from '../logger.js'
import { getConfig } from '../config.js'

export class InboxRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly dispatchBaseUrl: string = '',
    private readonly dispatchSecret: string = '',
  ) {}

  /**
   * Find-or-create a CRM contact for an inbound WhatsApp JID.
   * Returns null for group JIDs (not yet supported).
   */
  async resolveContact(
    accountId: string,
    jid: string,
    displayName: string | null,
  ): Promise<string | null> {
    if (isGroupJid(jid)) return null

    const rawPhone = jidToPhone(jid)
    const normalized = normalizePhone(rawPhone)
    if (!normalized) return null

    // Prefix with + for E.164 storage convention the CRM uses.
    const phone = `+${normalized}`
    const suffix = normalized.length >= 8 ? normalized.slice(-8) : normalized

    // Try to match an existing contact by phone suffix (same approach as CRM dedupe).
    const { data: candidates } = await this.supabase
      .from('contacts')
      .select('id, phone, name')
      .eq('account_id', accountId)
      .like('phone', `%${suffix}`)

    if (candidates) {
      const match = candidates.find((c: { phone: string }) => phonesMatch(c.phone, phone))
      if (match) {
        // Update display name if we now know it and didn't before.
        if (displayName && (!match.name || match.name === match.phone)) {
          await this.supabase
            .from('contacts')
            .update({ name: displayName, updated_at: new Date().toISOString() })
            .eq('id', match.id)
        }
        return match.id
      }
    }

    // Resolve account owner for the user_id audit column.
    const ownerUserId = await this.resolveOwnerUserId(accountId)
    if (!ownerUserId) return null

    const { data: created, error } = await this.supabase
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: ownerUserId,
        phone,
        name: displayName || phone,
      })
      .select('id')
      .single()

    if (error) {
      // Race condition — another concurrent inbound created the same contact.
      if (error.code === '23505') {
        const { data: raced } = await this.supabase
          .from('contacts')
          .select('id')
          .eq('account_id', accountId)
          .like('phone', `%${suffix}`)
          .limit(1)
          .maybeSingle()
        return raced?.id ?? null
      }
      logger.warn('error', { op: 'resolveContact', message: error.message })
      return null
    }

    return created?.id ?? null
  }

  /** Find-or-create the conversation for (accountId, contactId). */
  async resolveConversation(
    accountId: string,
    contactId: string,
  ): Promise<string | null> {
    const { data: existing } = await this.supabase
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(1)

    if (existing && existing.length > 0) return existing[0].id

    const ownerUserId = await this.resolveOwnerUserId(accountId)
    if (!ownerUserId) return null

    const { data: created, error } = await this.supabase
      .from('conversations')
      .insert({
        account_id: accountId,
        user_id: ownerUserId,
        contact_id: contactId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        const { data: raced } = await this.supabase
          .from('conversations')
          .select('id')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .limit(1)
          .maybeSingle()
        return raced?.id ?? null
      }
      logger.warn('error', { op: 'resolveConversation', message: error.message })
      return null
    }

    return created?.id ?? null
  }

  /**
   * Insert an inbound message row and update the conversation summary.
   * Returns the CRM message id on success, null on duplicate (idempotent).
   */
  async insertInboundMessage(
    conversationId: string,
    msg: InboundMessage,
    opts?: { accountId?: string; contactId?: string; userId?: string; wasContactCreated?: boolean },
  ): Promise<string | null> {
    const contentText =
      msg.body ??
      (msg.contentType !== 'text' && msg.contentType !== 'unknown'
        ? `[${msg.contentType}]`
        : null)

    // Idempotent insert — message_id + conversation_id is unique (migration 037).
    const { data: rows, error } = await this.supabase
      .from('messages')
      .upsert(
        {
          conversation_id: conversationId,
          sender_type: 'customer',
          content_type: msg.contentType === 'unknown' ? 'text' : msg.contentType,
          content_text: contentText,
          media_url: msg.mediaUrl ?? null,
          message_id: msg.messageId,
          status: 'delivered',
          created_at: new Date(msg.timestamp * 1000).toISOString(),
        },
        { onConflict: 'conversation_id,message_id', ignoreDuplicates: true },
      )
      .select('id')

    if (error) {
      logger.warn('error', { op: 'insertInboundMessage', message: error.message })
      return null
    }

    // Empty rows = duplicate (idempotent replay) — skip downstream work.
    if (!rows || rows.length === 0) {
      logger.debug('outbox_job_completed', { op: 'insertInboundMessage', duplicate: true, messageId: msg.messageId })
      return null
    }

    const msgId = rows[0].id as string

    // bump_conversation_on_inbound atomically increments unread_count +
    // updates last_message_text/at/status in one UPDATE.
    await this.supabase
      .rpc('bump_conversation_on_inbound', {
        p_conversation_id: conversationId,
        p_last_message_text: contentText ?? `[${msg.contentType}]`,
      })
      .then(() => {}, (err: unknown) => {
        // Fallback if RPC isn't available yet.
        logger.warn('error', { op: 'bump_conversation_on_inbound', message: String(err) })
        void this.supabase.from('conversations').update({
          last_message_text: contentText ?? `[${msg.contentType}]`,
          last_message_at: new Date(msg.timestamp * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          status: 'open',
        }).eq('id', conversationId)
      })

    // Dispatch automations + flows via internal CRM endpoint (fire-and-forget).
    if (opts?.accountId && opts?.contactId && this.dispatchBaseUrl && this.dispatchSecret) {
      void this.callDispatch({
        accountId: opts.accountId,
        conversationId,
        contactId: opts.contactId,
        userId: opts.userId ?? '',
        messageText: contentText,
        contentType: msg.contentType,
        messageId: msg.messageId,
        isFirstInbound: false,   // resolved by the CRM endpoint via DB query
        wasContactCreated: opts.wasContactCreated ?? false,
      })
    }

    return msgId
  }

  /** Fire-and-forget POST to the internal automation dispatch endpoint. */
  private callDispatch(payload: Record<string, unknown>): Promise<void> {
    const url = `${this.dispatchBaseUrl}/api/internal/whatsapp/dispatch`
    return fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': this.dispatchSecret,
      },
      body: JSON.stringify(payload),
    })
      .then(() => {})
      .catch((err: unknown) => {
        logger.warn('error', { op: 'callDispatch', message: String(err) })
      })
  }

  /** Update the CRM message status from a delivery/read receipt. */
  async updateMessageStatus(
    wamid: string,
    status: 'delivered' | 'read' | 'failed',
  ): Promise<void> {
    await this.supabase
      .from('messages')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('message_id', wamid)
  }

  /** Update CRM message status for a delivered outbox job (wamid → sent). */
  async markMessageSent(crmMessageId: string, wamid: string): Promise<void> {
    if (!crmMessageId) return
    await this.supabase
      .from('messages')
      .update({
        status: 'sent',
        message_id: wamid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', crmMessageId)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private ownerCache = new Map<string, string>()

  private async resolveOwnerUserId(accountId: string): Promise<string | null> {
    const cached = this.ownerCache.get(accountId)
    if (cached) return cached

    const { data } = await this.supabase
      .from('account_members')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()

    const id = data?.user_id ?? null
    if (id) this.ownerCache.set(accountId, id)
    return id
  }
}
