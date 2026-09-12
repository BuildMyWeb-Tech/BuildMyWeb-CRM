import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

// Gemini uses a query-param API key, not a Bearer header.
// Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}

interface GeminiContent {
  role: 'user' | 'model'
  parts: { text: string }[]
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    finishReason?: string
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  error?: { message?: string; code?: number }
}

export async function generateGemini(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  // Gemini separates system instruction from conversation turns
  const turns: GeminiContent[] = mergeConsecutive(messages).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: turns,
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Gemini', res)
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null

  if (data?.error?.message) {
    const code = data.error.code === 400 ? 'invalid_key' : 'provider_error'
    throw new AiError(`Gemini error: ${data.error.message}`, { code, status: data.error.code === 401 || data.error.code === 403 ? 401 : 502 })
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError('Gemini returned an empty response.', { code: 'empty_response' })
  }

  const usage = normalizeUsage({
    prompt: data?.usageMetadata?.promptTokenCount,
    completion: data?.usageMetadata?.candidatesTokenCount,
    total: data?.usageMetadata?.totalTokenCount,
  })

  return { text, usage }
}
