/**
 * Session persistence tests.
 *
 * Key test: save → simulate worker shutdown (new store instance) → load → verify.
 * This proves persistence is NOT tied to process memory.
 */
// Set required env vars before any module imports config.
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.WHATSAPP_WORKER_ID = 'test-worker'
process.env.WHATSAPP_ACCOUNT_ID = 'test-account'
process.env.WHATSAPP_SESSION_ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DbSessionStore } from '../session/db-store.js'
import type { AuthState } from '../provider/adapter.js'

// AES-256-GCM key for tests only — 32 bytes as hex.
const TEST_KEY = 'a'.repeat(64)

function makeFakeSupabase(storage: Map<string, Record<string, unknown>> = new Map()) {
  const db = storage

  function makeChain(tableName: string) {
    let record: Record<string, unknown> = {}
    let filterKey: string | null = null
    let filterVal: unknown = null
    let action: 'select' | 'upsert' | 'delete' | 'update' = 'select'
    let columns = '*'

    const chain = {
      select(cols: string) { columns = cols; action = 'select'; return chain },
      upsert(data: Record<string, unknown>) { record = data; action = 'upsert'; return chain },
      update(data: Record<string, unknown>) { record = data; action = 'update'; return chain },
      delete() { action = 'delete'; return chain },
      eq(key: string, val: unknown) { filterKey = key; filterVal = val; return chain },
      maybeSingle() {
        if (action === 'select') {
          const key = `${tableName}:${filterKey}:${filterVal}`
          const data = db.get(key) ?? null
          return Promise.resolve({ data: data ? (columns === '*' ? data : pickColumns(data, columns)) : null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        if (action === 'upsert') {
          const key = `${tableName}:whatsapp_account_id:${record.whatsapp_account_id}`
          db.set(key, { ...db.get(key), ...record })
          resolve({ data: record, error: null })
        } else if (action === 'delete') {
          const key = `${tableName}:${filterKey}:${filterVal}`
          db.delete(key)
          resolve({ data: null, error: null })
        } else {
          resolve({ data: null, error: null })
        }
      },
    }
    return chain
  }

  return {
    from: (table: string) => makeChain(table),
    rpc: undefined,
    _storage: db,
  }
}

function pickColumns(obj: Record<string, unknown>, cols: string): Record<string, unknown> {
  const keys = cols.split(',').map((s) => s.trim())
  const out: Record<string, unknown> = {}
  for (const k of keys) if (k in obj) out[k] = obj[k]
  return out
}

describe('DbSessionStore', () => {
  const accountId = 'test-account-id'
  const authState: AuthState = {
    creds: { registered: true, me: { id: '91999@s.whatsapp.net' } },
    keys: { 'pre-key': { '0': { keyPair: {}, id: 0, counter: 0 } } },
  }

  it('returns null when no session exists', async () => {
    const db = new Map<string, Record<string, unknown>>()
    const store = new DbSessionStore(makeFakeSupabase(db) as never, TEST_KEY)
    const result = await store.load(accountId)
    expect(result).toBeNull()
  })

  it('save → load round-trip (simulates worker restart)', async () => {
    // Shared storage — survives "restart" because it's outside process memory.
    const sharedDb = new Map<string, Record<string, unknown>>()

    // Worker 1: saves session.
    const store1 = new DbSessionStore(makeFakeSupabase(sharedDb) as never, TEST_KEY)
    await store1.save(accountId, authState)

    // Worker 2: NEW instance — simulates restart. Uses same underlying storage.
    const store2 = new DbSessionStore(makeFakeSupabase(sharedDb) as never, TEST_KEY)
    const loaded = await store2.load(accountId)

    expect(loaded).not.toBeNull()
    expect(loaded?.creds).toEqual(authState.creds)
  })

  it('encrypted state is not readable as plaintext', async () => {
    const sharedDb = new Map<string, Record<string, unknown>>()
    const store = new DbSessionStore(makeFakeSupabase(sharedDb) as never, TEST_KEY)
    await store.save(accountId, authState)

    // Grab the raw stored value.
    const key = `whatsapp_session_state:whatsapp_account_id:${accountId}`
    const raw = sharedDb.get(key) as Record<string, string>
    const encrypted = raw.encrypted_state
    // Must be in iv:ct:tag format, not contain the raw phone number.
    expect(encrypted.split(':').length).toBe(3)
    expect(encrypted).not.toContain('91999')
  })

  it('clear removes the session', async () => {
    const sharedDb = new Map<string, Record<string, unknown>>()
    const store = new DbSessionStore(makeFakeSupabase(sharedDb) as never, TEST_KEY)
    await store.save(accountId, authState)
    await store.clear(accountId)
    const result = await store.load(accountId)
    expect(result).toBeNull()
  })

  it('different encryption keys produce different ciphertext', async () => {
    const db1 = new Map<string, Record<string, unknown>>()
    const db2 = new Map<string, Record<string, unknown>>()
    const key1 = 'a'.repeat(64)
    const key2 = 'b'.repeat(64)
    const s1 = new DbSessionStore(makeFakeSupabase(db1) as never, key1)
    const s2 = new DbSessionStore(makeFakeSupabase(db2) as never, key2)
    await s1.save(accountId, authState)
    await s2.save(accountId, authState)
    const raw1 = (db1.get(`whatsapp_session_state:whatsapp_account_id:${accountId}`) as Record<string, string>).encrypted_state
    const raw2 = (db2.get(`whatsapp_session_state:whatsapp_account_id:${accountId}`) as Record<string, string>).encrypted_state
    expect(raw1).not.toBe(raw2)
  })
})
