import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}))

import { GET } from './route'

const params = { params: Promise.resolve({ token: 'share-token-1' }) }

function buildDb(opts: {
  file: { storage_path: string; name: string; is_public: boolean } | null
  fileError?: unknown
  signedUrl?: string | null
  signError?: unknown
}) {
  const fileChain: Record<string, unknown> = {}
  fileChain.select = vi.fn(() => fileChain)
  fileChain.eq = vi.fn(() => fileChain)
  fileChain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: opts.file, error: opts.fileError ?? null }),
  )

  return {
    from: vi.fn(() => fileChain),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() =>
          Promise.resolve(
            opts.signedUrl
              ? { data: { signedUrl: opts.signedUrl }, error: null }
              : { data: null, error: opts.signError ?? { message: 'sign failed' } },
          ),
        ),
      })),
    },
  }
}

beforeEach(() => {
  mocks.supabaseAdmin.mockReset()
})

describe('GET /api/files/public/[token]', () => {
  it('redirects to a freshly signed URL for a public file', async () => {
    mocks.supabaseAdmin.mockReturnValue(
      buildDb({
        file: { storage_path: 'acct-1/uuid-report.pdf', name: 'report.pdf', is_public: true },
        signedUrl: 'https://signed.example/report.pdf?token=abc',
      }),
    )

    const response = await GET(new Request('http://localhost/api/files/public/share-token-1'), params)

    expect(response.status).toBe(307) // NextResponse.redirect default
    expect(response.headers.get('location')).toBe('https://signed.example/report.pdf?token=abc')
  })

  it('returns 404 when the file is not public — the whole point of the toggle', async () => {
    mocks.supabaseAdmin.mockReturnValue(
      buildDb({
        file: { storage_path: 'acct-1/uuid-report.pdf', name: 'report.pdf', is_public: false },
      }),
    )

    const response = await GET(new Request('http://localhost/api/files/public/share-token-1'), params)
    expect(response.status).toBe(404)
  })

  it('returns 404 when the token matches nothing', async () => {
    mocks.supabaseAdmin.mockReturnValue(buildDb({ file: null }))

    const response = await GET(new Request('http://localhost/api/files/public/share-token-1'), params)
    expect(response.status).toBe(404)
  })

  it('returns 500 if the file is public but signing fails', async () => {
    mocks.supabaseAdmin.mockReturnValue(
      buildDb({
        file: { storage_path: 'acct-1/uuid-report.pdf', name: 'report.pdf', is_public: true },
        signedUrl: null,
      }),
    )

    const response = await GET(new Request('http://localhost/api/files/public/share-token-1'), params)
    expect(response.status).toBe(500)
  })
})