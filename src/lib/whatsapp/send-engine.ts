/**
 * Provider-aware engine send helper.
 *
 * Automations and flows call Meta send functions directly today. This module
 * adds a provider check so the same automation/flow step works whether the
 * account is connected via Meta Cloud API or via the QR/Baileys worker.
 *
 * QR path: inserts a messages row (sender_type='bot', status='sending') and
 * a whatsapp_message_outbox row.  The worker picks it up and stamps
 * status='sent' + wamid.
 *
 * Meta path: calls the existing Meta API functions unchanged.
 *
 * Interactive messages (buttons/lists) are Meta-only — QR/Baileys supports
 * text and media only.  An automation that sends interactive content against
 * a QR account will log a warning and fall back to sending the body text
 * as plain text.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import {
  sanitizePhoneForMeta,
  isValidE164,
} from '@/lib/whatsapp/phone-utils'

export interface EngineQrSendArgs {
  db: SupabaseClient
  accountId: string
  conversationId: string
  contactId: string
  waAccountId: string   // whatsapp_accounts.id for the QR connection
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document'
  text?: string
  mediaUrl?: string
  mimetype?: string
  caption?: string
  filename?: string
  aiGenerated?: boolean
}

/**
 * Resolve whether this account has an active QR/Baileys connection.
 * Returns the whatsapp_accounts row id if QR CONNECTED, null otherwise.
 */
export async function resolveQrAccount(
  db: SupabaseClient,
  accountId: string,
): Promise<string | null> {
  const { data } = await db
    .from('whatsapp_accounts')
    .select('id, connection_state')
    .eq('account_id', accountId)
    .eq('provider', 'qr')
    .maybeSingle()

  if (!data || data.connection_state !== 'CONNECTED') return null
  return data.id
}

/**
 * Send a message through the QR outbox.
 * Inserts a CRM messages row immediately (status='sending') and queues
 * an outbox row for the worker.  Returns the CRM message id (not a wamid —
 * the wamid is unknown until the worker delivers).
 */
export async function engineSendViaQrOutbox(
  args: EngineQrSendArgs,
): Promise<{ whatsapp_message_id: string }> {
  const { db, accountId, conversationId, contactId, waAccountId } = args

  // Resolve recipient phone from the contact row (needed for the outbox).
  const { data: contact } = await db
    .from('contacts')
    .select('phone')
    .eq('id', contactId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (!contact?.phone) {
    throw new Error('contact not found or has no phone for QR send')
  }

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) {
    throw new Error(`contact phone invalid for QR send: ${contact.phone}`)
  }

  const contentText = args.text ?? args.caption ?? null
  const preview = contentText ?? `[${args.messageType}]`

  // Insert the CRM message row so the inbox shows it immediately as 'sending'.
  const { data: msgRow, error: msgErr } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'bot',
      content_type: args.messageType,
      content_text: contentText,
      media_url: args.mediaUrl ?? null,
      status: 'sending',
      ai_generated: args.aiGenerated ?? false,
    })
    .select('id')
    .single()

  if (msgErr || !msgRow) {
    throw new Error(`QR outbox: failed to persist message: ${msgErr?.message}`)
  }

  const payload: Record<string, unknown> =
    args.messageType === 'text'
      ? { text: args.text ?? '' }
      : {
          url: args.mediaUrl,
          mimetype: args.mimetype ?? 'application/octet-stream',
          caption: args.caption,
          filename: args.filename,
        }

  const { error: outboxErr } = await db
    .from('whatsapp_message_outbox')
    .insert({
      account_id: accountId,
      whatsapp_account_id: waAccountId,
      conversation_id: conversationId,
      message_id: msgRow.id,
      recipient: sanitized,
      message_type: args.messageType,
      payload,
      idempotency_key: randomUUID(),
    })

  if (outboxErr) {
    // Rollback the message to 'failed' so the inbox doesn't show an eternal 'sending'.
    await db.from('messages').update({ status: 'failed' }).eq('id', msgRow.id)
    throw new Error(`QR outbox: failed to queue message: ${outboxErr.message}`)
  }

  // Update conversation summary.
  await db
    .from('conversations')
    .update({
      last_message_text: preview,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  // Return the CRM message id as the whatsapp_message_id placeholder.
  // The real wamid is set by the worker once delivered.
  return { whatsapp_message_id: msgRow.id }
}
