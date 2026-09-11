/**
 * Internal worker → CRM automation dispatch endpoint.
 *
 * Called by the WhatsApp worker (fire-and-forget, non-blocking) after it
 * inserts an inbound customer message via InboxRepository.  This endpoint
 * runs the same automation + flow dispatch that the Meta webhook handler
 * runs, so QR-originated messages receive identical CRM treatment.
 *
 * Security:
 *   - Not exposed to the browser — it uses an INTERNAL_API_SECRET header.
 *   - The secret must match INTERNAL_API_SECRET env var on the Next.js side
 *     and NEXTJS_INTERNAL_SECRET on the worker side.
 *   - Always returns 200 to the worker (fire-and-forget semantics); real
 *     errors are logged server-side only.
 */
import { NextResponse } from 'next/server'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function POST(request: Request) {
  // Authenticate via shared secret — never trust account IDs without this.
  const supplied = request.headers.get('x-internal-secret') ?? ''
  if (!INTERNAL_SECRET || supplied !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    accountId: string
    conversationId: string
    contactId: string
    userId: string
    messageText: string | null
    contentType: string
    messageId: string
    isFirstInbound: boolean
    wasContactCreated: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    accountId,
    conversationId,
    contactId,
    userId,
    messageText,
    isFirstInbound,
    wasContactCreated,
  } = body

  if (!accountId || !conversationId || !contactId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fire-and-forget — respond immediately, run dispatch in background.
  // Using after() would be ideal on Vercel but the internal route runs
  // on a persistent server so a plain Promise is fine.
  void (async () => {
    try {
      const inboundText = messageText ?? ''

      // Flow dispatch — same as webhook handler.
      const flowResult = await dispatchInboundToFlows({
        accountId,
        userId,
        contactId,
        conversationId,
        message: { kind: 'text', text: inboundText, meta_message_id: body.messageId },
        isFirstInboundMessage: isFirstInbound,
      })
      const flowConsumed = flowResult.consumed

      // Automation triggers — mirror the webhook handler logic exactly.
      const triggers: (
        | 'new_contact_created'
        | 'first_inbound_message'
        | 'new_message_received'
        | 'keyword_match'
      )[] = []

      if (wasContactCreated) triggers.unshift('new_contact_created')
      if (isFirstInbound) triggers.unshift('first_inbound_message')
      if (!flowConsumed) triggers.push('new_message_received', 'keyword_match')

      for (const triggerType of triggers) {
        await runAutomationsForTrigger({
          accountId,
          triggerType,
          contactId,
          context: {
            message_text: inboundText,
            conversation_id: conversationId,
          },
        }).catch((err) =>
          console.error('[internal/whatsapp/dispatch] automation failed:', err)
        )
      }
    } catch (err) {
      console.error('[internal/whatsapp/dispatch] dispatch error:', err)
    }
  })()

  return NextResponse.json({ ok: true })
}
