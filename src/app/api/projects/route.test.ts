import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getCurrentAccount: vi.fn(),
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}))

import { POST } from './route'

function request(body: unknown) {
  return new Request('http://localhost/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Builds a `ctx.supabase` stand-in whose `.from(table)` returns a
// fresh chain per call, keyed by table name, so the 3-step create
// flow (pipelines -> pipeline_stages -> projects) can be asserted
// step by step.
function buildScopedClient(opts: {
  pipelineError?: unknown
  stagesError?: unknown
  projectError?: unknown
}) {
  const calls: string[] = []

  function chain(finalResult: unknown, isArrayInsert = false) {
    const c: Record<string, unknown> = {}
    c.insert = vi.fn(() => c)
    c.select = vi.fn(() => c)
    c.single = vi.fn(() => Promise.resolve(finalResult))
    if (isArrayInsert) {
      // pipeline_stages insert doesn't chain .select().single() in the route
      c.then = (resolve: (v: unknown) => void) => resolve(finalResult)
    }
    return c
  }

  const from = vi.fn((table: string) => {
    calls.push(table)
    if (table === 'pipelines') {
      return chain({
        data: opts.pipelineError ? null : { id: 'pipeline-1' },
        error: opts.pipelineError ?? null,
      })
    }
    if (table === 'pipeline_stages') {
      return chain({ error: opts.stagesError ?? null }, true)
    }
    if (table === 'projects') {
      return chain({
        data: opts.projectError
          ? null
          : { id: 'project-1', name: 'Test Project', pipeline_id: 'pipeline-1' },
        error: opts.projectError ?? null,
      })
    }
    throw new Error(`unexpected table in test: ${table}`)
  })

  return { supabase: { from }, calls }
}

const baseCtx = {
  accountId: 'account-1',
  userId: 'user-1',
  role: 'agent',
  account: { id: 'account-1', name: 'Acme' },
}

beforeEach(() => {
  mocks.requireRole.mockReset()
  mocks.getCurrentAccount.mockReset()
})

describe('POST /api/projects', () => {
  it('rejects a missing name before touching the database', async () => {
    mocks.requireRole.mockResolvedValue({ ...baseCtx, supabase: { from: vi.fn() } })

    const response = await POST(request({}))
    expect(response.status).toBe(400)
  })

  it('creates the pipeline, seeds 4 default stages, then creates the project', async () => {
    const { supabase, calls } = buildScopedClient({})
    mocks.requireRole.mockResolvedValue({ ...baseCtx, supabase })

    const response = await POST(request({ name: 'Website Redesign', client_name: 'Acme Salon' }))

    expect(response.status).toBe(201)
    expect(calls).toEqual(['pipelines', 'pipeline_stages', 'projects'])
  })

  it('stops and reports an error if the board (pipeline) fails to create', async () => {
    const { supabase, calls } = buildScopedClient({ pipelineError: { message: 'db down' } })
    mocks.requireRole.mockResolvedValue({ ...baseCtx, supabase })

    const response = await POST(request({ name: 'Website Redesign' }))

    expect(response.status).toBe(500)
    // Never reaches stage seeding or project creation once the board fails.
    expect(calls).toEqual(['pipelines'])
  })

  it('stops before creating the project if stage seeding fails', async () => {
    const { supabase, calls } = buildScopedClient({ stagesError: { message: 'db down' } })
    mocks.requireRole.mockResolvedValue({ ...baseCtx, supabase })

    const response = await POST(request({ name: 'Website Redesign' }))

    expect(response.status).toBe(500)
    expect(calls).toEqual(['pipelines', 'pipeline_stages'])
  })

  it('accepts a project with no client_name and no client_contact_id (standalone project)', async () => {
    const { supabase } = buildScopedClient({})
    mocks.requireRole.mockResolvedValue({ ...baseCtx, supabase })

    const response = await POST(request({ name: 'Internal Tooling' }))
    expect(response.status).toBe(201)
  })
})