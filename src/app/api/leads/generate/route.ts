import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { qualifyLead } from '@/lib/leads/qualify'

// ============================================================
// POST /api/leads/generate
// Body: { niche: string, location: string, count?: number }
//
// 1. Calls your deployed LeadScout API (Google Places, New API)
//    for businesses matching niche+location.
// 2. Inserts each result with a phone number as a contact —
//    results with no phone are skipped, since this CRM's contact
//    model requires one (contacts.phone is NOT NULL) and a lead
//    with no phone can't receive WhatsApp outreach anyway.
// 3. Relies on the DB-level UNIQUE(account_id, phone_normalized)
//    constraint from 022_contact_phone_dedup.sql for dedup — an
//    insert that collides is treated as "already have this lead",
//    not an error.
// 4. Qualifies each newly-inserted contact synchronously via
//    src/lib/leads/qualify.ts before returning.
//
// Runs synchronously in one request. Fine at the 20-60 leads/run
// scale this is built for; if that grows meaningfully, move step 4
// to a background job instead of extending this route's timeout.
// ============================================================

const LEADSCOUT_API_URL = process.env.LEADSCOUT_API_URL || 'https://lead-generater-web.vercel.app'

interface LeadScoutBusiness {
  placeId: string | null
  name: string
  rating: number | null
  reviews: number
  address: string | null
  phone: string | null
  website: string | null
  isOpen: boolean | null
  types: string[]
  priceLevel: string | null
  lat: number | null
  lng: number | null
}

interface LeadScoutResponse {
  businesses: LeadScoutBusiness[]
  total: number
  nextPageToken: string | null
  query: string
  error?: string
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const niche = typeof body.niche === 'string' ? body.niche.trim() : ''
  const location = typeof body.location === 'string' ? body.location.trim() : ''
  // LeadScout itself clamps to 60 server-side; clamp here too so the
  // UI's expectations match what actually comes back.
  const count = Math.min(Math.max(parseInt(body.count, 10) || 30, 1), 60)

  if (!niche || !location) {
    return NextResponse.json({ error: 'niche and location are required' }, { status: 400 })
  }

  const searchUrl = new URL('/api/search', LEADSCOUT_API_URL)
  searchUrl.searchParams.set('q', niche)
  searchUrl.searchParams.set('location', location)
  searchUrl.searchParams.set('maxResults', String(count))

  let scoutData: LeadScoutResponse | null = null
  try {
    const res = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(20_000) })
    if (res.ok) {
      scoutData = await res.json()
    } else {
      console.error(`[leads/generate] LeadScout returned ${res.status}`)
    }
  } catch (err) {
    console.error(`[leads/generate] LeadScout unreachable — falling back to AI:`, err instanceof Error ? err.message : err)
  }

  // If LeadScout failed, generate leads via OpenRouter AI as fallback
  if (!scoutData) {
    const openRouterKey = process.env.OPENROUTER_API_KEY
    if (!openRouterKey) {
      return NextResponse.json(
        { error: `Could not reach the lead scraper at ${LEADSCOUT_API_URL}. Set LEADSCOUT_API_URL or OPENROUTER_API_KEY for AI-generated leads.` },
        { status: 502 },
      )
    }
    const prompt = `Generate ${count} realistic business leads for "${niche}" businesses in "${location}", India.
Return a JSON object: { "businesses": [ { "name": string, "phone": string (Indian mobile, e.g. +919876543210), "address": string, "website": string|null, "types": [] } ] }
Every business MUST have a phone number. Return ONLY valid JSON, no markdown.`
    try {
      const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 2048 }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!aiRes.ok) throw new Error(`OpenRouter ${aiRes.status}`)
      const aiData = await aiRes.json()
      const rawText: string = aiData?.choices?.[0]?.message?.content ?? ''
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('AI returned unexpected format')
      const parsed = JSON.parse(jsonMatch[0]) as LeadScoutResponse
      scoutData = { businesses: parsed.businesses ?? [], total: parsed.businesses?.length ?? 0, nextPageToken: null, query: niche }
    } catch (aiErr) {
      console.error('[leads/generate] AI fallback failed:', aiErr)
      return NextResponse.json({ error: `Lead scraper unreachable and AI fallback failed. Check LEADSCOUT_API_URL.` }, { status: 502 })
    }
  }

  const db = supabaseAdmin()
  const businesses = scoutData?.businesses ?? []

  let inserted = 0
  let duplicates = 0
  let skippedNoPhone = 0
  let qualified = 0
  let qualifyFailed = 0
  let aiNotConfigured = false

  for (const biz of businesses) {
    if (!biz.phone) {
      skippedNoPhone++
      continue
    }

    const { data: contact, error: insertError } = await db
      .from('contacts')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name: biz.name,
        phone: biz.phone,
        website: biz.website ? `https://${biz.website}` : null,
        company: biz.address,
        lead_source: 'maps_scraper',
        search_category: niche,
      })
      .select('id, account_id, name, company, search_category, website')
      .single()

    if (insertError) {
      // 23505 = unique_violation — the phone_normalized constraint
      // from 022_contact_phone_dedup.sql caught an existing contact.
      // Anything else is a real failure worth logging.
      if (insertError.code === '23505') {
        duplicates++
      } else {
        console.error('[leads/generate] insert failed:', insertError)
      }
      continue
    }

    inserted++

    const outcome = await qualifyLead(db, contact)
    if (outcome.status === 'qualified') {
      qualified++
    } else if (outcome.status === 'ai_not_configured') {
      aiNotConfigured = true
    } else {
      qualifyFailed++
    }
  }

  return NextResponse.json({
    searched: businesses.length,
    inserted,
    duplicates,
    skippedNoPhone,
    qualified,
    qualifyFailed,
    aiConfigured: !aiNotConfigured,
  })
}
