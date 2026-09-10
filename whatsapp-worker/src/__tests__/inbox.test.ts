process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.WHATSAPP_WORKER_ID = 'test-worker'
process.env.WHATSAPP_ACCOUNT_ID = 'test-account'
process.env.WHATSAPP_SESSION_ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InboxRepository } from '../inbox/repository.js'
import type { InboundMessage } from '../provider/adapter.js'

// ── Fake Supabase ─────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function makeFakeDb(tables: Record<string, Row[]> = {}) {
  const store: Record<string, Row[]> = { ...tables }

  function makeChain(table: string) {
    let _rows: Row[] = [...(store[table] ?? [])]
    let _filters: Array<(r: Row) => boolean> = []
    let _insert: Row | null = null
    let _update: Row | null = null
    let _limit: number | null = null
    let _order: { col: string; asc: boolean } | null = null

    const chain: Record<string, unknown> = {
      select: (_cols: string) => { _rows = [...(store[table] ?? [])]; return chain },
      insert: (data: Row) => { _insert = data; return chain },
      update: (data: Row) => { _update = data; return chain },
      eq: (col: string, val: unknown) => {
        _filters.push((r) => r[col] === val)
        return chain
      },
      like: (col: string, pattern: string) => {
        const suffix = pattern.replace(/^%/, '')
        _filters.push((r) => String(r[col] ?? '').endsWith(suffix))
        return chain
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        _order = { col, asc: opts?.ascending !== false }
        return chain
      },
      limit: (n: number) => { _limit = n; return chain },
      maybeSingle: () => {
        const filtered = _rows.filter((r) => _filters.every((f) => f(r)))
        return Promise.resolve({ data: filtered[0] ?? null, error: null })
      },
      single: () => {
        if (_insert) {
          const row = { id: `new-${Math.random().toString(36).slice(2)}`, ..._insert }
          store[table] = [...(store[table] ?? []), row]
          return Promise.resolve({ data: row, error: null })
        }
        const filtered = _rows.filter((r) => _filters.every((f) => f(r)))
        return Promise.resolve({ data: filtered[0] ?? null, error: filtered[0] ? null : { message: 'not found' } })
      },
      then: (resolve: (v: { data: unknown; error: null }) => void) => {
        if (_insert) {
          const row = { id: `new-${Math.random().toString(36).slice(2)}`, ..._insert }
          store[table] = [...(store[table] ?? []), row]
          return Promise.resolve({ data: row, error: null }).then(resolve)
        }
        if (_update) {
          const filtered = _rows.filter((r) => _filters.every((f) => f(r)))
          for (const r of filtered) Object.assign(r, _update)
          return Promise.resolve({ data: filtered, error: null }).then(resolve)
        }
        const filtered = _rows.filter((r) => _filters.every((f) => f(r)))
        if (_order) {
          filtered.sort((a, b) => {
            const av = a[_order!.col] as string
            const bv = b[_order!.col] as string
            return _order!.asc ? av < bv ? -1 : 1 : av > bv ? -1 : 1
          })
        }
        return Promise.resolve({ data: _limit ? filtered.slice(0, _limit) : filtered, error: null }).then(resolve)
      },
    }
    return chain
  }

  return {
    from: (table: string) => makeChain(table),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    _store: store,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const ACCOUNT_ID = 'account-abc'
const OWNER_USER_ID = 'user-owner'

function makeRepo(tables: Record<string, Row[]> = {}) {
  const db = makeFakeDb({
    account_members: [{ account_id: ACCOUNT_ID, user_id: OWNER_USER_ID, role: 'owner' }],
    contacts: [],
    conversations: [],
    messages: [],
    ...tables,
  })
  return { repo: new InboxRepository(db as never), db }
}

describe('InboxRepository', () => {
  it('creates a new contact when none exists', async () => {
    const { repo, db } = makeRepo()
    const contactId = await repo.resolveContact(ACCOUNT_ID, '919999999999@s.whatsapp.net', 'Alice')
    expect(contactId).toBeTruthy()
    const contacts = db._store.contacts
    expect(contacts.length).toBe(1)
    expect(contacts[0].phone).toBe('+919999999999')
    expect(contacts[0].name).toBe('Alice')
  })

  it('reuses an existing contact with matching phone', async () => {
    const { repo, db } = makeRepo({
      contacts: [{ id: 'existing-contact', account_id: ACCOUNT_ID, phone: '+919999999999', name: 'Bob', user_id: OWNER_USER_ID }],
    })
    const contactId = await repo.resolveContact(ACCOUNT_ID, '919999999999@s.whatsapp.net', 'Bob')
    expect(contactId).toBe('existing-contact')
    // No new contact created
    expect(db._store.contacts.length).toBe(1)
  })

  it('creates conversation when none exists', async () => {
    const { repo, db } = makeRepo()
    const convId = await repo.resolveConversation(ACCOUNT_ID, 'contact-123')
    expect(convId).toBeTruthy()
    expect(db._store.conversations.length).toBe(1)
  })

  it('reuses existing conversation', async () => {
    const { repo } = makeRepo({
      conversations: [{ id: 'conv-existing', account_id: ACCOUNT_ID, contact_id: 'contact-123', created_at: '2024-01-01' }],
    })
    const convId = await repo.resolveConversation(ACCOUNT_ID, 'contact-123')
    expect(convId).toBe('conv-existing')
  })

  it('inserts an inbound text message', async () => {
    const { repo, db } = makeRepo({
      conversations: [{ id: 'conv-1', account_id: ACCOUNT_ID, contact_id: 'c1', created_at: '2024-01-01' }],
    })
    const msg: InboundMessage = {
      messageId: 'wamid-001',
      from: '91888@s.whatsapp.net',
      body: 'Hello!',
      contentType: 'text',
      timestamp: 1700000000,
    }
    const msgId = await repo.insertInboundMessage('conv-1', msg)
    expect(msgId).toBeTruthy()
    const inserted = db._store.messages[0]
    expect(inserted.content_text).toBe('Hello!')
    expect(inserted.sender_type).toBe('customer')
    expect(inserted.message_id).toBe('wamid-001')
  })

  it('updates message status by wamid', async () => {
    const { repo, db } = makeRepo({
      messages: [{ id: 'msg-1', message_id: 'wamid-001', status: 'sent', conversation_id: 'conv-1' }],
    })
    await repo.updateMessageStatus('wamid-001', 'read')
    expect(db._store.messages[0].status).toBe('read')
  })

  it('skips group JIDs (returns null)', async () => {
    const { repo } = makeRepo()
    const result = await repo.resolveContact(ACCOUNT_ID, '123456789@g.us', null)
    expect(result).toBeNull()
  })

  it('account isolation: does not return contacts from other accounts', async () => {
    const { repo, db } = makeRepo({
      contacts: [{ id: 'other-contact', account_id: 'other-account', phone: '+919999999999', name: 'Eve', user_id: 'u2' }],
    })
    const contactId = await repo.resolveContact(ACCOUNT_ID, '919999999999@s.whatsapp.net', 'Alice')
    // Should create a new contact for ACCOUNT_ID, not return 'other-contact'
    expect(contactId).not.toBe('other-contact')
    expect(db._store.contacts.some((c: Row) => c.account_id === ACCOUNT_ID)).toBe(true)
  })
})
