/**
 * InboxRepository — worker-side writes to the CRM's messages/conversations/contacts.
 * Uses the service-role Supabase client (bypasses RLS) so the worker can write
 * without a user session. All writes are scoped to the owning account_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { InboundMessage } from '../provider/adapter.js'
import { jidToPhone, normalizePhone, phonesMatch, isGroupJid } from './phone-utils.js'
import { logger } from '../logger.js'

export class InboxRepository {
  constructor(private readonly supabase: SupabaseClient) {}

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

  /** Insert an inbound message row and update the conversation summary. */
  async insertInboundMessage(
    conversationId: string,
    msg: InboundMessage,
  ): Promise<string | null> {
    const contentText =
      msg.body ??
      (msg.contentType !== 'text' && msg.contentType !== 'unknown'
        ? `[${msg.contentType}]`
        : null)

    const { data, error } = await this.supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'customer',
        content_type: msg.contentType === 'unknown' ? 'text' : msg.contentType,
        content_text: contentText,
        media_url: msg.mediaUrl ?? null,
        message_id: msg.messageId,   // WhatsApp message ID (wamid)
        status: 'delivered',
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        // Duplicate message (re-delivery) — idempotent, not an error.
        logger.debug('outbox_job_completed', { op: 'insertInboundMessage', duplicate: true })
        return null
      }
      logger.warn('error', { op: 'insertInboundMessage', message: error.message })
      return null
    }

    // Update conversation summary (unread_count++ and last message preview).
    await this.supabase
      .from('conversations')
      .update({
        last_message_text: contentText ?? `[${msg.contentType}]`,
        last_message_at: new Date(msg.timestamp * 1000).toISOString(),
        // unread_count incremented via RPC below
        updated_at: new Date().toISOString(),
        status: 'open',
      })
      .eq('id', conversationId)

    // Increment unread_count separately (Supabase JS doesn't support col expressions in update).
    await this.supabase.rpc('increment_conversation_unread', {
      conversation_id: conversationId,
    }).then(() => {}, () => {})

    return data?.id ?? null
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
