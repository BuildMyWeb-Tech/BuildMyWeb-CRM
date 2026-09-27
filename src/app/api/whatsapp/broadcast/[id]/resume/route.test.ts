/**
 * Tests for POST /api/whatsapp/broadcast/[id]/resume  (QR pause → sending)
 *
 * Note: This is the QR "resume from paused" endpoint.
 * It is distinct from the Meta broadcast resume (which retries stalled pending jobs).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

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

const mockRequireRole = vi.mocked(requireRole)

function makeUserClient(broadcast: Record<string, unknown> | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: broadcast, error: null })),
          })),
        })),
      })),
    })),
  }
}

function setup(broadcast: Record<string, unknown> | null) {
  mockRequireRole.mockResolvedValue({
    supabase: makeUserClient(broadcast) as never,
    accountId: 'acc-1',
    userId: 'user-1',
    role: 'agent',
  })
  mockAdminUpdate.mockResolvedValue({ error: null })
}

function req(id: string) {
  return new Request(`http://localhost/api/whatsapp/broadcast/${id}/resume`, { method: 'POST' })
}

describe('POST /api/whatsapp/broadcast/[id]/resume (QR pause→sending)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('1. returns 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(401)
  })

  it('2. returns 404 when broadcast not found', async () => {
    setup(null)
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(404)
  })

  it('3. returns 400 for a Meta broadcast', async () => {
    setup({ id: 'bc-1', status: 'paused', provider: 'meta' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('QR broadcasts')
  })

  it('4. returns 400 when broadcast is sending (not paused)', async () => {
    setup({ id: 'bc-1', status: 'sending', provider: 'qr' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("'sending'")
  })

  it('5. returns 200 and transitions paused → sending', async () => {
    setup({ id: 'bc-1', status: 'paused', provider: 'qr' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.status).toBe('sending')
  })
})
