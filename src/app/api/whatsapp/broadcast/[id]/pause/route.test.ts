/**
 * Tests for POST /api/whatsapp/broadcast/[id]/pause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockBroadcastSelect = vi.fn()
const mockAdminUpdate = vi.fn()

vi.mock('@/lib/auth/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/account')>()
  return {
    ...actual,
    requireRole: vi.fn(),
    toErrorResponse: vi.fn((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 401 })
    }),
  }
})

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => mockAdminUpdate()),
      })),
    })),
  })),
}))

import { requireRole } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

const mockRequireRole = vi.mocked(requireRole)
const mockSupabaseAdmin = vi.mocked(supabaseAdmin)

function makeUserClient(broadcast: Record<string, unknown> | null, fetchError: unknown = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: broadcast,
              error: fetchError,
            })),
          })),
        })),
      })),
    })),
  }
}

function setupAuth(broadcast: Record<string, unknown> | null, fetchError: unknown = null) {
  const client = makeUserClient(broadcast, fetchError)
  mockRequireRole.mockResolvedValue({
    supabase: client as never,
    accountId: 'acc-1',
    userId: 'user-1',
    role: 'agent',
  })
  mockAdminUpdate.mockResolvedValue({ error: null })
  return client
}

function makeRequest(broadcastId: string) {
  return new Request(`http://localhost/api/whatsapp/broadcast/${broadcastId}/pause`, {
    method: 'POST',
  })
}

const SENDING_BROADCAST = { id: 'bc-1', status: 'sending', provider: 'qr' }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/whatsapp/broadcast/[id]/pause', () => {
  beforeEach(() => vi.clearAllMocks())

  it('1. returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(makeRequest('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(401)
  })

  it('2. returns 404 when broadcast not found', async () => {
    setupAuth(null)
    const res = await POST(makeRequest('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('not found')
  })

  it('3. returns 400 for a Meta (non-QR) broadcast', async () => {
    setupAuth({ id: 'bc-1', status: 'sending', provider: 'meta' })
    const res = await POST(makeRequest('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('QR broadcasts')
  })

  it('4. returns 400 when broadcast is already paused', async () => {
    setupAuth({ id: 'bc-1', status: 'paused', provider: 'qr' })
    const res = await POST(makeRequest('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("'paused'")
  })

  it('5. returns 400 when broadcast is already sent', async () => {
    setupAuth({ id: 'bc-1', status: 'sent', provider: 'qr' })
    const res = await POST(makeRequest('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("'sent'")
  })

  it('6. returns 200 and pauses a sending broadcast', async () => {
    setupAuth(SENDING_BROADCAST)
    const res = await POST(makeRequest('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.status).toBe('paused')
  })

  it('7. calls admin client to update status (not user client)', async () => {
    setupAuth(SENDING_BROADCAST)
    await POST(makeRequest('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(mockSupabaseAdmin).toHaveBeenCalled()
  })

  it('8. returns 500 when admin update fails', async () => {
    setupAuth(SENDING_BROADCAST)
    mockAdminUpdate.mockResolvedValue({ error: { message: 'db error' } })
    const res = await POST(makeRequest('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(500)
  })
})
