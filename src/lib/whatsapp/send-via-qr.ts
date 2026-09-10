/**
 * QR/Baileys outbound send path.
 *
 * Instead of calling Meta's Cloud API, this inserts:
 *  1. A `messages` row with status='sending' (visible in inbox immediately).
 *  2. A `whatsapp_message_outbox` row for the worker to pick up and deliver.
 *
 * The worker updates the message row to status='sent' and stores the wamid
 * once delivery is confirmed by Baileys.
 *
 * Only text and media types are supported (no templates/interactive for QR).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'
import { SendMessageError, type SendMessageParams, type SendMessageResult } from '@/lib/whatsapp/send-message'
import { randomUUID } from 'crypto'

export async function sendViaQrOutbox(
  db: SupabaseClient,
  accountId: string,
  waAccountId: string,
  params: SendMessageParams,
): Promise<SendMessageResult> {
  const { conversationId, messageType, contentText, mediaUrl, filename } = params

  // Verify conversation + contact for this account.
  const { data: conv, error: convErr } = await db
    .from('conversations')
    .select('id, contact:contacts(id, phone)')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .single()

  if (convErr || !conv) {
    throw new SendMessageError('not_found', 'Conversation not found', 404)
  }

  const raw = conv.contact
  const contact = (Array.isArray(raw) ? raw[0] : raw) as { id: string; phone: string } | null
  if (!contact?.phone) {
    throw new SendMessageError('bad_request', 'Contact has no phone number', 400)
  }

  const sanitized = sanitizePhoneForMeta(contact.phone)
  if (!isValidE164(sanitized)) {
    throw new SendMessageError('bad_request', 'Invalid phone number format', 400)
  }

  // Persist message immediately so the inbox can show it as "sending".
  const { data: msgRow, error: msgErr } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      content_type: messageType,
      content_text: contentText ?? null,
      media_url: mediaUrl ?? null,
      status: 'sending',
    })
    .select('id')
    .single()

  if (msgErr || !msgRow) {
    throw new SendMessageError('db_error', 'Failed to persist message', 500)
  }

  // Build outbox payload.
  const payload: Record<string, unknown> =
    messageType === 'text'
      ? { text: contentText ?? '' }
      : { url: mediaUrl, mimetype: mimetypeFor(messageType), caption: contentText, filename }

  const idempotencyKey = randomUUID()

  const { error: outboxErr } = await db
    .from('whatsapp_message_outbox')
    .insert({
      account_id: accountId,
      whatsapp_account_id: waAccountId,
      conversation_id: conversationId,
      message_id: msgRow.id,
      recipient: sanitized,
      message_type: messageType,
      payload,
      idempotency_key: idempotencyKey,
    })

  if (outboxErr) {
    // Best-effort: mark the message failed so the UI doesn't show it as sending forever.
    await db.from('messages').update({ status: 'failed' }).eq('id', msgRow.id)
    throw new SendMessageError('db_error', 'Failed to queue message', 500)
  }

  // Update conversation summary.
  await db
    .from('conversations')
    .update({
      last_message_text: contentText ?? `[${messageType}]`,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  return { messageId: msgRow.id, whatsappMessageId: '' }
}

function mimetypeFor(type: string): string {
  if (type === 'image') return 'image/jpeg'
  if (type === 'audio') return 'audio/ogg; codecs=opus'
  if (type === 'video') return 'video/mp4'
  return 'application/octet-stream'
}
