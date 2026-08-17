import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  supabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

import { DELETE, PATCH } from './route'

const context = {
  supabase: { name: 'scoped-client' },
  accountId: 'account-1',
  userId: 'user-1',
  role: 'agent',
  account: { id: 'account-1', name: 'Acme' },
}

function request(method: 'PATCH' | 'DELETE', body?: unknown) {
  return new Request('http://localhost/api/tasks/task-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const params = { params: Promise.resolve({ id: 'task-1' }) }

// Builds a chainable query mock: every method returns `this` except
// the final one, which resolves to `{ error }`. Matches how the
// Supabase JS client is used throughout this route (a thenable
// builder), without pulling in the real client.
function chainableUpdate(error: unknown = null) {
  const chain: Record<string, unknown> = {}
  chain.update = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.delete = vi.fn(() => chain)
  chain.then = (resolve: (v: { error: unknown }) => void) => resolve({ error })
  return chain
}

beforeEach(() => {
  mocks.requireRole.mockReset()
  mocks.supabaseAdmin.mockReset()
  mocks.requireRole.mockResolvedValue(context)
})

describe('PATCH /api/tasks/[id]', () => {
  it('rejects an empty title without touching the database', async () => {
    const fromMock = vi.fn()
    mocks.supabaseAdmin.mockReturnValue({ from: fromMock })

    const response = await PATCH(request('PATCH', { title: '   ' }), params)

    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects a priority outside the allowed enum', async () => {
    const fromMock = vi.fn()
    mocks.supabaseAdmin.mockReturnValue({ from: fromMock })

    const response = await PATCH(request('PATCH', { priority: 'urgent-ish' }), params)

    expect(response.status).toBe(400)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('accepts a bare stage move (drag-and-drop payload) and scopes the update to this account', async () => {
    const chain = chainableUpdate(null)
    const fromMock = vi.fn(() => chain)
    mocks.supabaseAdmin.mockReturnValue({ from: fromMock })

    const response = await PATCH(request('PATCH', { stage_id: 'stage-2' }), params)

    expect(response.status).toBe(200)
    expect(fromMock).toHaveBeenCalledWith('project_tasks')
    expect(chain.update).toHaveBeenCalledWith({ stage_id: 'stage-2' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'task-1')
    expect(chain.eq).toHaveBeenCalledWith('account_id', 'account-1')
  })

  it('surfaces a database error as a 500', async () => {
    const chain = chainableUpdate({ message: 'db exploded' })
    mocks.supabaseAdmin.mockReturnValue({ from: vi.fn(() => chain) })

    const response = await PATCH(request('PATCH', { stage_id: 'stage-2' }), params)
    expect(response.status).toBe(500)
  })

  it('no-ops (200, no db call) when the body has nothing recognized', async () => {
    const fromMock = vi.fn()
    mocks.supabaseAdmin.mockReturnValue({ from: fromMock })

    const response = await PATCH(request('PATCH', { unrelated_field: 'x' }), params)
    expect(response.status).toBe(200)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/tasks/[id]', () => {
  it('deletes scoped to account and task id', async () => {
    const chain = chainableUpdate(null)
    const fromMock = vi.fn(() => chain)
    mocks.supabaseAdmin.mockReturnValue({ from: fromMock })

    const response = await DELETE(request('DELETE'), params)

    expect(response.status).toBe(200)
    expect(fromMock).toHaveBeenCalledWith('project_tasks')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'task-1')
    expect(chain.eq).toHaveBeenCalledWith('account_id', 'account-1')
  })
})