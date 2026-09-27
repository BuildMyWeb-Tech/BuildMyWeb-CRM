/**
 * Phase I-4 / K-4: Tests for broadcast delivery/read receipt mapping.
 * Verifies that message_status events update broadcast_recipients.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.WHATSAPP_WORKER_ID = 'test-worker'
process.env.WHATSAPP_ACCOUNT_ID = 'test-account'
process.env.WHATSAPP_SESSION_ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectionManager } from '../connection/manager.js'
import type { WhatsAppProvider, ProviderEvent } from '../provider/adapter.js'
import type { WhatsAppRepository } from '../repository/index.js'
import type { InboxRepository } from '../inbox/repository.js'

function makeProvider(): WhatsAppProvider & { _emit: (e: ProviderEvent) => void } {
  let handler: ((e: ProviderEvent) => void) | null = null
  return {
    initialize: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    getConnectionState: vi.fn(() => 'DISCONNECTED' as const),
    getQRCode: () => null,
    sendText: vi.fn(async () => ({ messageId: '', status: 'sent' as const })),
    sendMedia: vi.fn(async () => ({ messageId: '', status: 'sent' as const })),
    markRead: vi.fn(async () => {}),
    onEvent: vi.fn((h) => { handler = h }),
    _emit: (e) => { handler?.(e) },
  }
}

function makeRepo(): Partial<WhatsAppRepository> & { getBroadcastRecipientByWamid: ReturnType<typeof vi.fn>; updateBroadcastRecipientDelivery: ReturnType<typeof vi.fn> } {
  return {
    claimLock: vi.fn(async () => true),
    releaseLock: vi.fn(async () => {}),
    setConnectionState: vi.fn(async () => {}),
    checkDisconnectRequested: vi.fn(async () => false),
    getBroadcastRecipientByWamid: vi.fn(async () => null as { recipientId: string; broadcastId: string } | null),
    updateBroadcastRecipientDelivery: vi.fn(async () => {}),
  }
}

function makeInboxRepo(): Partial<InboxRepository> {
  return {
    updateMessageStatus: vi.fn(async () => {}),
    resolveContact: vi.fn(async () => null),
    insertInboundMessage: vi.fn(async () => null),
  }
}

async function makeStartedManager() {
  const provider = makeProvider()
  const repo = makeRepo()
  const inboxRepo = makeInboxRepo()
  const mgr = new ConnectionManager({
    provider,
    sessionStore: { load: vi.fn(async () => null), save: vi.fn(async () => {}), clear: vi.fn(async () => {}) } as never,
    repo: repo as never,
    inboxRepo: inboxRepo as never,
    whatsappAccountId: 'wa-1',
    accountId: 'acc-1',
    workerId: 'w-1',
  })
  await mgr.start()
  return { mgr, provider, repo, inboxRepo }
}

describe('ConnectionManager — broadcast delivery tracking (Phase I-4)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps delivered wamid to broadcast_recipients when match exists', async () => {
    const { provider, repo } = await makeStartedManager()
    repo.getBroadcastRecipientByWamid.mockResolvedValueOnce({
      recipientId: 'rcp-1', broadcastId: 'bc-1',
    })

    provider._emit({ type: 'message_status', messageId: 'wamid-delivered', status: 'delivered' })
    // Allow microtasks/async to settle
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.getBroadcastRecipientByWamid).toHaveBeenCalledWith('wamid-delivered')
    expect(repo.updateBroadcastRecipientDelivery).toHaveBeenCalledWith('rcp-1', 'delivered')
  })

  it('maps read wamid to broadcast_recipients when match exists', async () => {
    const { provider, repo } = await makeStartedManager()
    repo.getBroadcastRecipientByWamid.mockResolvedValueOnce({
      recipientId: 'rcp-2', broadcastId: 'bc-1',
    })

    provider._emit({ type: 'message_status', messageId: 'wamid-read', status: 'read' })
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.updateBroadcastRecipientDelivery).toHaveBeenCalledWith('rcp-2', 'read')
  })

  it('still calls inboxRepo.updateMessageStatus for all events', async () => {
    const { provider, repo, inboxRepo } = await makeStartedManager()
    repo.getBroadcastRecipientByWamid.mockResolvedValueOnce(null)

    provider._emit({ type: 'message_status', messageId: 'wamid-x', status: 'delivered' })
    await new Promise((r) => setTimeout(r, 0))

    expect(inboxRepo.updateMessageStatus).toHaveBeenCalledWith('wamid-x', 'delivered')
  })

  it('does NOT call getBroadcastRecipientByWamid for failed events', async () => {
    const { provider, repo } = await makeStartedManager()

    provider._emit({ type: 'message_status', messageId: 'wamid-fail', status: 'failed' })
    await new Promise((r) => setTimeout(r, 0))

    // failed status has no delivery/read mapping (it's handled separately)
    expect(repo.getBroadcastRecipientByWamid).not.toHaveBeenCalled()
  })

  it('does NOT throw when getBroadcastRecipientByWamid throws — non-fatal', async () => {
    const { provider, repo } = await makeStartedManager()
    repo.getBroadcastRecipientByWamid.mockRejectedValueOnce(new Error('DB error'))

    // Should not throw
    await expect(async () => {
      provider._emit({ type: 'message_status', messageId: 'wamid-err', status: 'delivered' })
      await new Promise((r) => setTimeout(r, 0))
    }).not.toThrow()
  })
})
