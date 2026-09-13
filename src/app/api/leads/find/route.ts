import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { loadAiConfig } from '@/lib/ai/config'

// POST /api/leads/find — use AI to find leads for a niche+location
// and optionally fetch from a configured target URL.
export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    const niche: string = body?.niche ?? ''
    const location: string = body?.location ?? ''
    const count: number = Math.min(Number(body?.count ?? 10), 50)
    const targetUrl: string = body?.target_url ?? ''

    if (!niche || !location) {
      return NextResponse.json({ error: 'niche and location are required' }, { status: 400 })
    }

    // If a target URL is given, try to fetch from it (basic GET, return raw as text)
    if (targetUrl) {
      try {
        const res = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 CRM Lead Finder' },
          signal: AbortSignal.timeout(10000),
        })
        if (res.ok) {
          const text = await res.text()
          // Return raw text for client to process (show in preview)
          return NextResponse.json({ source: 'url', raw: text.slice(0, 5000), leads: [] })
        }
      } catch { /* ignore — fall through to AI */ }
    }

    // Fall back to AI-generated leads
    const config = await loadAiConfig(ctx.supabase, ctx.accountId, { requireActive: false })
    if (!config) {
      return NextResponse.json({ error: 'AI not configured. Add API key in Settings → AI Config to use lead generation.' }, { status: 422 })
    }

    const prompt = `Generate ${count} realistic business leads for the niche "${niche}" in "${location}".
Return a JSON array of objects with these fields:
- name: business name
- owner: owner/contact name (optional)
- phone: phone number (realistic local format)
- email: email address
- address: full address
- website: website URL (optional)
- notes: one sentence about their services

Return ONLY valid JSON array, no markdown, no other text.`

    let rawText = ''
    if (config.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_completion_tokens: 2048,
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) return NextResponse.json({ error: `AI provider error: ${res.status}` }, { status: 502 })
      const data = await res.json()
      rawText = data?.choices?.[0]?.message?.content ?? ''
    } else if (config.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model || 'claude-haiku-4-5-20251001',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) return NextResponse.json({ error: `AI provider error: ${res.status}` }, { status: 502 })
      const data = await res.json()
      rawText = data?.content?.[0]?.text ?? ''
    } else {
      // Gemini
      const rawGeminiModel = config.model || 'gemini-flash-latest'
      const geminiModel = rawGeminiModel.startsWith('models/') ? rawGeminiModel.slice('models/'.length) : rawGeminiModel
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${config.apiKey}`
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) return NextResponse.json({ error: `AI provider error: ${res.status}` }, { status: 502 })
      const data = await res.json()
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    }

    const arrMatch = rawText.match(/\[[\s\S]*\]/)
    if (!arrMatch) return NextResponse.json({ error: 'AI returned unexpected format', raw: rawText }, { status: 422 })
    const leads = JSON.parse(arrMatch[0]) as Record<string, string>[]

    return NextResponse.json({ source: 'ai', leads })
  } catch (err) {
    return toErrorResponse(err)
  }
}
