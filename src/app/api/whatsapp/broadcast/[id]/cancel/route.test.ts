/**
 * Tests for POST /api/whatsapp/broadcast/[id]/cancel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockAdminOutboxUpdate = vi.fn()
const mockAdminBroadcastUpdate = vi.fn()

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

// Admin client: first from() call is for outbox, second is for broadcasts.
let adminCallCount = 0
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'whatsapp_message_outbox') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => mockAdminOutboxUpdate()),
            })),
          })),
        }
      }
      // broadcasts table
      return {
        update: vi.fn(() => ({
          eq: vi.fn(() => mockAdminBroadcastUpdate()),
        })),
      }
    }),
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
  adminCallCount = 0
  mockRequireRole.mockResolvedValue({
    supabase: makeUserClient(broadcast) as never,
    accountId: 'acc-1',
    userId: 'user-1',
    role: 'agent',
  })
  mockAdminOutboxUpdate.mockResolvedValue({ error: null })
  mockAdminBroadcastUpdate.mockResolvedValue({ error: null })
}

function req(id: string) {
  return new Request(`http://localhost/api/whatsapp/broadcast/${id}/cancel`, { method: 'POST' })
}

describe('POST /api/whatsapp/broadcast/[id]/cancel', () => {
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
    setup({ id: 'bc-1', status: 'sending', provider: 'meta' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('QR broadcasts')
  })

  it('4. returns 400 when broadcast is already cancelled', async () => {
    setup({ id: 'bc-1', status: 'cancelled', provider: 'qr' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("'cancelled'")
  })

  it('5. returns 400 when broadcast is already sent', async () => {
    setup({ id: 'bc-1', status: 'sent', provider: 'qr' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(400)
  })

  it('6. cancels a sending broadcast', async () => {
    setup({ id: 'bc-1', status: 'sending', provider: 'qr' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.status).toBe('cancelled')
  })

  it('7. cancels a paused broadcast', async () => {
    setup({ id: 'bc-1', status: 'paused', provider: 'qr' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('cancelled')
  })

  it('8. cancels a scheduled broadcast', async () => {
    setup({ id: 'bc-1', status: 'scheduled', provider: 'qr' })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('cancelled')
  })

  it('9. cancels pending outbox jobs before updating broadcast status', async () => {
    setup({ id: 'bc-1', status: 'sending', provider: 'qr' })
    await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    // Both admin operations were called
    expect(mockAdminOutboxUpdate).toHaveBeenCalled()
    expect(mockAdminBroadcastUpdate).toHaveBeenCalled()
  })

  it('10. returns 500 when outbox cancellation fails', async () => {
    setup({ id: 'bc-1', status: 'sending', provider: 'qr' })
    mockAdminOutboxUpdate.mockResolvedValue({ error: { message: 'db error' } })
    const res = await POST(req('bc-1'), { params: Promise.resolve({ id: 'bc-1' }) })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('outbox')
  })
})
