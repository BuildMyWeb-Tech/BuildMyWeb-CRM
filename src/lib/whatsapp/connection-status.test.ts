/**
 * Tests for the provider-agnostic WhatsApp connection status helper.
 *
 * Regression coverage for: inbox incorrectly showing "WhatsApp not connected"
 * when a QR/Baileys connection is active.
 */
import { describe, it, expect } from 'vitest'
import { getWhatsAppConnectionStatus } from './connection-status'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Minimal fake Supabase client ─────────────────────────────────────────────

interface FakeRow {
  id?: string
  status?: string
  phone_number_id?: string
  phone_number?: string
  connection_state?: string
  provider?: string
  account_id?: string
}

function fakeDb(tables: Record<string, FakeRow | null>): SupabaseClient {
  return {
    from(table: string) {
      let _eqFilters: Array<[string, unknown]> = []
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => { _eqFilters.push([col, val]); return chain },
        maybeSingle: async () => {
          const rows = tables[table]
          if (!rows) return { data: null, error: null }
          // Apply all eq filters
          const match = (row: FakeRow) =>
            _eqFilters.every(([col, val]) => (row as Record<string, unknown>)[col] === val)
          const row = Array.isArray(rows)
            ? (rows as FakeRow[]).find(match) ?? null
            : (match(rows) ? rows : null)
          return { data: row, error: null }
        },
      }
      return chain as unknown as ReturnType<SupabaseClient['from']>
    },
  } as unknown as SupabaseClient
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const ACCOUNT = 'acc-001'

describe('getWhatsAppConnectionStatus', () => {
  it('1. no Meta config, QR DISCONNECTED → connected=false', async () => {
    const db = fakeDb({
      whatsapp_config: null,
      whatsapp_accounts: { id: 'wa-1', provider: 'qr', connection_state: 'DISCONNECTED', account_id: ACCOUNT },
    })
    const result = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(result.connected).toBe(false)
    expect(result.provider).toBeNull()
  })

  it('2. no Meta config, QR CONNECTED → connected=true, provider=qr', async () => {
    const db = fakeDb({
      whatsapp_config: null,
      whatsapp_accounts: { id: 'wa-1', provider: 'qr', connection_state: 'CONNECTED', account_id: ACCOUNT, phone_number: '+919999999999' },
    })
    const result = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(result.connected).toBe(true)
    expect(result.provider).toBe('qr')
    expect(result.phoneNumber).toBe('+919999999999')
  })

  it('3. Meta connected, no QR → connected=true, provider=meta', async () => {
    const db = fakeDb({
      whatsapp_config: { id: 'cfg-1', status: 'connected', phone_number_id: '123456', account_id: ACCOUNT },
      whatsapp_accounts: null,
    })
    const result = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(result.connected).toBe(true)
    expect(result.provider).toBe('meta')
  })

  it('4. QR exists, state=QR_REQUIRED → connected=false', async () => {
    const db = fakeDb({
      whatsapp_config: null,
      whatsapp_accounts: { id: 'wa-1', provider: 'qr', connection_state: 'QR_REQUIRED', account_id: ACCOUNT },
    })
    const result = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(result.connected).toBe(false)
  })

  it('5. QR exists, state=STARTING → connected=false', async () => {
    const db = fakeDb({
      whatsapp_config: null,
      whatsapp_accounts: { id: 'wa-1', provider: 'qr', connection_state: 'STARTING', account_id: ACCOUNT },
    })
    const result = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(result.connected).toBe(false)
  })

  it('6. QR exists, state=PAIRING → connected=false', async () => {
    const db = fakeDb({
      whatsapp_config: null,
      whatsapp_accounts: { id: 'wa-1', provider: 'qr', connection_state: 'PAIRING', account_id: ACCOUNT },
    })
    const result = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(result.connected).toBe(false)
  })

  it('7. QR CONNECTED → no banner (connected=true means banner hidden)', async () => {
    const db = fakeDb({
      whatsapp_config: null,
      whatsapp_accounts: { id: 'wa-1', provider: 'qr', connection_state: 'CONNECTED', account_id: ACCOUNT },
    })
    const { connected } = await getWhatsAppConnectionStatus(db, ACCOUNT)
    // The inbox banner renders when connected===false; assert it would NOT render
    expect(connected).toBe(true)
  })

  it('8. QR CONNECTED → provider=qr (send path uses outbox)', async () => {
    const db = fakeDb({
      whatsapp_config: null,
      whatsapp_accounts: { id: 'wa-qr-1', provider: 'qr', connection_state: 'CONNECTED', account_id: ACCOUNT },
    })
    const { provider, accountRowId } = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(provider).toBe('qr')
    expect(accountRowId).toBe('wa-qr-1')
  })

  it('9. Meta connected → provider=meta (existing Meta send path)', async () => {
    const db = fakeDb({
      whatsapp_config: { id: 'cfg-1', status: 'connected', phone_number_id: '123456', account_id: ACCOUNT },
      whatsapp_accounts: null,
    })
    const { provider } = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(provider).toBe('meta')
  })

  it('10. Meta not connected (status!=connected) + QR CONNECTED → QR wins', async () => {
    const db = fakeDb({
      whatsapp_config: { id: 'cfg-1', status: 'disconnected', phone_number_id: '123456', account_id: ACCOUNT },
      whatsapp_accounts: { id: 'wa-1', provider: 'qr', connection_state: 'CONNECTED', account_id: ACCOUNT },
    })
    const result = await getWhatsAppConnectionStatus(db, ACCOUNT)
    expect(result.connected).toBe(true)
    expect(result.provider).toBe('qr')
  })

  it('empty accountId → connected=false', async () => {
    const db = fakeDb({ whatsapp_config: null, whatsapp_accounts: null })
    const result = await getWhatsAppConnectionStatus(db, '')
    expect(result.connected).toBe(false)
  })
})
