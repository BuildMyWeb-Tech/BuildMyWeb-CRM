import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAiConfig } from '@/lib/ai/config'
import { generateReply } from '@/lib/ai/generate'
import type { ChatMessage } from '@/lib/ai/types'

// ============================================================
// Lead qualification — scores a freshly-scraped contact against
// BuildMyWeb's 3 products using the account's existing AI config
// (same encrypted BYO key used by the reply assistant, loaded via
// loadAiConfig — no separate key management for this feature).
//
// Called synchronously, per-contact, from
// src/app/api/leads/generate/route.ts right after insert. Not
// wired through the automations engine: new_contact_created only
// fires from the WhatsApp webhook today (see
// src/app/api/whatsapp/webhook/route.ts), not from arbitrary
// contact inserts, so routing this through automations would
// require either faking a trigger or extending that dispatch path
// for one caller. Calling it inline here is simpler and the only
// caller that needs it.
// ============================================================

const QUALIFY_SYSTEM_PROMPT = `You qualify a local Indian business as a sales lead for BuildMyWeb, which sells 3 ready-made software products (not custom development):
- Salon Booking Management System — for salons, spas, unisex/beauty parlours
- GoCart (Multi-Vendor Ecommerce) — for marketplaces, distributors, D2C/ecommerce sellers
- Billing Core — for pharmacies, grocery, supermarkets, cosmetics, general retail

Use ONLY the signals given in the user message. Do not assume facts you were not given — no invented details about their operations, staff, or customers.

Pick niche from exactly: "salon", "ecommerce_retail", "pharmacy_grocery_retail", "unclear".
Map niche to product: salon -> "Salon Booking Management System", ecommerce_retail -> "GoCart (Multi-Vendor Ecommerce)", pharmacy_grocery_retail -> "Billing Core", unclear -> "NONE".

Score 0-100 on likelihood to buy: no website is a stronger opportunity signal than having one; an existing modern site with booking/ecommerce built in is a weaker signal (they may already have a solution). Priority: HOT if score >= 70, WARM if 40-69, COLD if < 40.

Infer exactly ONE realistic, specific pain point. Do not exaggerate or claim to have observed anything you weren't told.

Respond with ONLY a JSON object, no other text, no markdown fences:
{"niche": "", "matched_product": "", "lead_score": 0, "priority": "", "pain_point": "", "reason": ""}`

export interface QualificationResult {
  niche: string
  matched_product: string
  lead_score: number
  priority: 'HOT' | 'WARM' | 'COLD'
  pain_point: string
  reason: string
}

export function parseQualification(raw: string): QualificationResult | null {
      // Strip markdown fences defensively — models sometimes wrap JSON in
  // ```json ... ``` even when told not to.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    const parsed = JSON.parse(cleaned)
    if (
      typeof parsed.niche === 'string' &&
      typeof parsed.matched_product === 'string' &&
      typeof parsed.lead_score === 'number' &&
      typeof parsed.priority === 'string' &&
      ['HOT', 'WARM', 'COLD'].includes(parsed.priority)
    ) {
      return parsed as QualificationResult
    }
    return null
  } catch {
    return null
  }
}

export interface QualifiableContact {
  id: string
  account_id: string
  name: string | null
  company: string | null
  search_category: string | null
  website: string | null
}

export interface QualifyOutcome {
  contactId: string
  status: 'qualified' | 'ai_not_configured' | 'ai_error' | 'unparseable'
  dealCreated: boolean
}

/**
 * Qualifies one contact: calls the account's configured AI provider,
 * writes the result onto the contact row, and creates a deal in the
 * "BuildMyWeb Sales" pipeline's NEW stage. Never throws — failures
 * are reported in the returned status so a batch import can continue
 * past individual failures instead of aborting the whole run.
 */
export async function qualifyLead(
  db: SupabaseClient,
  contact: QualifiableContact,
): Promise<QualifyOutcome> {
  const config = await loadAiConfig(db, contact.account_id, { requireActive: false })
  if (!config) {
    return { contactId: contact.id, status: 'ai_not_configured', dealCreated: false }
  }

  const userMessage: ChatMessage = {
    role: 'user',
    content: [
      `Business Name: ${contact.name ?? contact.company ?? 'Unknown'}`,
      `Search Category (as typed by the user sourcing this lead): ${contact.search_category ?? 'unknown'}`,
      `Website: ${contact.website ?? 'none'}`,
    ].join('\n'),
  }

  let raw: string
  try {
    const result = await generateReply({
      config,
      systemPrompt: QUALIFY_SYSTEM_PROMPT,
      messages: [userMessage],
    })
    raw = result.text
  } catch (err) {
    console.error(`[qualifyLead] AI call failed for contact ${contact.id}:`, err)
    return { contactId: contact.id, status: 'ai_error', dealCreated: false }
  }

  const qualification = parseQualification(raw)
  if (!qualification) {
    console.error(`[qualifyLead] unparseable AI response for contact ${contact.id}:`, raw)
    return { contactId: contact.id, status: 'unparseable', dealCreated: false }
  }

  await db
    .from('contacts')
    .update({
      niche: qualification.niche,
      matched_product: qualification.matched_product,
      lead_score: qualification.lead_score,
      priority: qualification.priority,
      pain_point: qualification.pain_point,
      ai_reason: qualification.reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contact.id)
    .eq('account_id', contact.account_id)

  let dealCreated = false
  if (qualification.matched_product !== 'NONE') {
    const { data: pipeline } = await db
      .from('pipelines')
      .select('id')
      .eq('account_id', contact.account_id)
      .eq('name', 'BuildMyWeb Sales')
      .maybeSingle()

    if (pipeline) {
      const { data: stage } = await db
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipeline.id)
        .eq('name', 'NEW')
        .maybeSingle()

      if (stage) {
        const { data: acct } = await db
          .from('accounts')
          .select('owner_user_id')
          .eq('id', contact.account_id)
          .maybeSingle()

        const { error: dealError } = await db.from('deals').insert({
          user_id: acct?.owner_user_id,
          pipeline_id: pipeline.id,
          stage_id: stage.id,
          contact_id: contact.id,
          title: `${contact.name ?? contact.company ?? 'New lead'} — ${qualification.matched_product}`,
          value: 0,
          status: 'open',
        })
        dealCreated = !dealError
        if (dealError) {
          console.error(`[qualifyLead] deal creation failed for contact ${contact.id}:`, dealError)
        }
      }
    }
  }

  return { contactId: contact.id, status: 'qualified', dealCreated }
}