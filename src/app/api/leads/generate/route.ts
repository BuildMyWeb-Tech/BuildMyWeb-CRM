import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { qualifyLead } from '@/lib/leads/qualify'

// ============================================================
// POST /api/leads/generate
// Body: { niche: string, location: string, count?: number }
//
// Calls Google Places API (New) directly to search businesses,
// then inserts each result with a phone number as a contact.
// Results with no phone are skipped (contacts.phone is NOT NULL).
// Uses UNIQUE(account_id, phone_normalized) for dedup.
// ============================================================

const PLACES_BASE = 'https://places.googleapis.com/v1'
const PLACES_FIELDS = [
  'places.id',
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours',
  'places.location',
  'places.types',
  'places.priceLevel',
  'nextPageToken',
].join(',')

interface PlacesPlace {
  id?: string
  displayName?: { text: string; languageCode: string }
  rating?: number
  userRatingCount?: number
  formattedAddress?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  regularOpeningHours?: { openNow: boolean }
  location?: { latitude: number; longitude: number }
  types?: string[]
  priceLevel?: string
}

interface Business {
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

function normalizeBusiness(place: PlacesPlace): Business {
  const rawSite = place.websiteUri ?? null
  const website = rawSite ? rawSite.replace(/^https?:\/\//, '').replace(/\/$/, '') : null
  return {
    placeId:    place.id ?? null,
    name:       place.displayName?.text ?? 'Unknown',
    rating:     place.rating ?? null,
    reviews:    place.userRatingCount ?? 0,
    address:    place.formattedAddress ?? null,
    phone:      place.internationalPhoneNumber ?? null,
    website,
    isOpen:     place.regularOpeningHours?.openNow ?? null,
    types:      (place.types ?? []).slice(0, 3),
    priceLevel: place.priceLevel ?? null,
    lat:        place.location?.latitude ?? null,
    lng:        place.location?.longitude ?? null,
  }
}

async function placesTextSearch(query: string, apiKey: string, pageToken?: string): Promise<{ places: PlacesPlace[]; nextPageToken?: string }> {
  const body: Record<string, unknown> = { textQuery: query, maxResultCount: 20 }
  if (pageToken) body.pageToken = pageToken

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': PLACES_FIELDS,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    const msg = err?.error?.message ?? `status ${res.status}`
    if (res.status === 403 || msg.includes('API_KEY') || msg.includes('PERMISSION')) {
      throw new Error(`Google Places API access denied: ${msg}. Enable "Places API (New)" in Google Cloud Console.`)
    }
    throw new Error(`Google Places API error: ${msg}`)
  }

  return res.json()
}

async function searchGooglePlaces(keyword: string, location: string, maxResults: number, apiKey: string): Promise<Business[]> {
  const query = `${keyword} in ${location}`

  const data1 = await placesTextSearch(query, apiKey)
  let rawPlaces: PlacesPlace[] = data1.places ?? []
  let nextToken = data1.nextPageToken

  // Fetch page 2 if needed and available
  if (rawPlaces.length < maxResults && nextToken) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const data2 = await placesTextSearch(query, apiKey, nextToken)
      rawPlaces = [...rawPlaces, ...(data2.places ?? [])]
    } catch (err) {
      console.warn('[leads/generate] page 2 failed:', err instanceof Error ? err.message : err)
    }
  }

  // Normalize, dedup by placeId, trim to maxResults, sort by rating
  const seen = new Set<string>()
  return rawPlaces
    .map(normalizeBusiness)
    .filter((b) => { if (!b.placeId || seen.has(b.placeId)) return false; seen.add(b.placeId); return true })
    .slice(0, maxResults)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
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

  const niche    = typeof body.niche    === 'string' ? body.niche.trim()    : ''
  const location = typeof body.location === 'string' ? body.location.trim() : ''
  const count    = Math.min(Math.max(parseInt(body.count, 10) || 30, 1), 60)

  if (!niche || !location) {
    return NextResponse.json({ error: 'niche and location are required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY is not configured on the server.' }, { status: 500 })
  }

  let businesses: Business[]
  try {
    businesses = await searchGooglePlaces(niche, location, count, apiKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[leads/generate] Google Places search failed:', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const db = supabaseAdmin()
  let inserted      = 0
  let duplicates    = 0
  let skippedNoPhone = 0
  let qualified     = 0
  let qualifyFailed = 0
  let aiNotConfigured = false
  let firstInsertError: string | null = null

  for (const biz of businesses) {
    if (!biz.phone) { skippedNoPhone++; continue }

    const { data: contact, error: insertError } = await db
      .from('contacts')
      .insert({
        account_id:      ctx.accountId,
        user_id:         ctx.userId,
        name:            biz.name,
        phone:           biz.phone,
        company:         biz.address,
        lead_source:     'maps_scraper',
        search_category: niche,
      })
      .select('id, account_id, name, company, search_category')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        duplicates++
      } else {
        console.error('[leads/generate] insert failed:', insertError)
        if (!firstInsertError) firstInsertError = `${insertError.code}: ${insertError.message}`
      }
      continue
    }

    inserted++

    const outcome = await qualifyLead(db, { ...contact, website: biz.website ?? null })
    if (outcome.status === 'qualified')         qualified++
    else if (outcome.status === 'ai_not_configured') aiNotConfigured = true
    else                                          qualifyFailed++
  }

  return NextResponse.json({
    searched: businesses.length,
    inserted,
    duplicates,
    skippedNoPhone,
    qualified,
    qualifyFailed,
    aiConfigured: !aiNotConfigured,
    ...(firstInsertError ? { insertError: firstInsertError } : {}),
  })
}
