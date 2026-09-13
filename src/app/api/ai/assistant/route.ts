import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { loadAiConfig } from '@/lib/ai/config'

// POST /api/ai/assistant — parse a natural-language CRM command and return a structured action.
// The actual execution happens on the client side using the action data returned.

const SYSTEM_PROMPT = `You are a CRM command parser. The user will type a natural language command.
Parse it into a structured JSON action to execute in the CRM.

Today's date: {{TODAY}}

Supported actions:
- create_project: Create a new project. Fields: name (required), status ("active"|"inactive", default "active"), client_name (optional string to match or create client)
- create_product: Create a new product. Fields: project_name (required — the product/app name), purpose (optional description), priority ("low"|"medium"|"high"|"urgent", default "medium")
- create_task: Create a project task. Fields: title (required), project_name (optional, to find the project), due_date (ISO date YYYY-MM-DD, optional), show_date (ISO date YYYY-MM-DD — when the task becomes visible in UI; use for "show from X date"), priority ("low"|"medium"|"high"|"urgent", default "medium"), status (optional)
- create_enquiry: Create a new client enquiry/lead. Fields: title (required), phone (optional), status ("new"|"in_discussion"|"hold", default "new")
- create_product_task: Create a product task. Fields: title (required), product_name (optional — name of the product to link), priority ("low"|"medium"|"high"|"urgent", default "medium"), due_date (optional ISO date)
- update_task: Update an existing task. Fields: title_query (text to search for), updates (object with fields to change: title, due_date, priority, status)
- delete_task: Delete a task by title. Fields: title_query (text to match)

Multi-step commands: If the user says "create a product X with a task Y" or "create product X with to do Y", return ONE action for create_product and include a "follow_up" field:
{
  "action": "create_product",
  "data": { "project_name": "X", ... },
  "follow_up": { "action": "create_product_task", "data": { "title": "Y", "product_name": "X" } },
  "summary": "Create product X and add task Y"
}

Date parsing rules:
- "15th sept 2026" → "2026-09-15"
- "tomorrow" → add 1 day to today
- "next Monday" → compute next Monday's date
- "14th sept" → "2026-09-14" (use current year if unambiguous)
- Always output ISO 8601 format (YYYY-MM-DD)

Return ONLY valid JSON (no markdown, no explanation):
{
  "action": "action_name",
  "data": { ...fields },
  "summary": "One sentence describing what will be done"
}

If you cannot parse the command, return:
{ "action": "unknown", "data": {}, "summary": "Could not understand the command." }
`

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    const message: string = body?.message ?? ''
    if (!message.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

    const config = await loadAiConfig(ctx.supabase, ctx.accountId, { requireActive: false })
    if (!config) {
      return NextResponse.json({ error: 'AI not configured. Please add your OpenAI/Anthropic API key in Settings → AI Config.' }, { status: 422 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const systemPrompt = SYSTEM_PROMPT.replace('{{TODAY}}', today)

    // Call the configured AI provider
    let rawText = ''
    if (config.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          max_completion_tokens: 512,
        }),
        signal: AbortSignal.timeout(15000),
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
          system: systemPrompt,
          messages: [{ role: 'user', content: message }],
          max_tokens: 512,
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return NextResponse.json({ error: `AI provider error: ${res.status}` }, { status: 502 })
      const data = await res.json()
      rawText = data?.content?.[0]?.text ?? ''
    } else {
      // Gemini
      const rawModel = config.model || 'gemini-flash-latest'
      const model = rawModel.startsWith('models/') ? rawModel.slice('models/'.length) : rawModel
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        console.error('[ai/assistant] Gemini error', res.status, JSON.stringify(errBody))
        const msg = errBody?.error?.message ?? `status ${res.status}`
        return NextResponse.json({ error: `Gemini error: ${msg}` }, { status: 502 })
      }
      const data = await res.json()
      rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    }

    // Parse JSON from response (strip markdown fences if any)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'AI returned unexpected format', raw: rawText }, { status: 422 })

    let parsed: { action: string; data: Record<string, unknown>; summary: string; follow_up?: { action: string; data: Record<string, unknown> } }
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Could not parse AI response as JSON', raw: rawText }, { status: 422 })
    }

    return NextResponse.json({ action: parsed.action, data: parsed.data, summary: parsed.summary, follow_up: parsed.follow_up ?? null })
  } catch (err) {
    return toErrorResponse(err)
  }
}
