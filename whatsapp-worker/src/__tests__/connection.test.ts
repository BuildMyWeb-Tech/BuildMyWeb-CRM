process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.WHATSAPP_WORKER_ID = 'test-worker'
process.env.WHATSAPP_ACCOUNT_ID = 'test-account'
process.env.WHATSAPP_SESSION_ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectionManager } from '../connection/manager.js'
import type {
  WhatsAppProvider,
  ProviderEvent,
  ProviderEventHandler,
  AuthState,
  MediaPayload,
  SendResult,
} from '../provider/adapter.js'
import type { WhatsAppSessionStore } from '../session/store.js'
import type { ConnectionState } from '../connection/states.js'
import type { InboxRepository } from '../inbox/repository.js'

// ── Test doubles ─────────────────────────────────────────────────────────────

function makeProvider(): WhatsAppProvider & { _emit: (e: ProviderEvent) => void; _state: ConnectionState } {
  let handler: ProviderEventHandler | null = null
  let state: ConnectionState = 'DISCONNECTED'
  return {
    _emit: (e: ProviderEvent) => handler?.(e),
    get _state() { return state },
    onEvent: (h) => { handler = h },
    initialize: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    getConnectionState: () => state,
    getQRCode: () => null,
    sendText: vi.fn(async () => ({ messageId: '', status: 'sent' as const })),
    sendMedia: vi.fn(async (_jid: string, _m: MediaPayload): Promise<SendResult> => ({ messageId: '', status: 'sent' as const })),
    markRead: vi.fn(async () => {}),
  }
}

function makeSessionStore(): WhatsAppSessionStore & { _saved: AuthState | null } {
  let saved: AuthState | null = null
  return {
    get _saved() { return saved },
    load: vi.fn(async () => saved),
    save: vi.fn(async (_id: string, s: AuthState) => { saved = s }),
    clear: vi.fn(async () => { saved = null }),
  }
}

function makeRepo(lockResult = true) {
  return {
    claimLock: vi.fn(async () => lockResult),
    releaseLock: vi.fn(async () => {}),
    heartbeat: vi.fn(async () => {}),
    setConnectionState: vi.fn(async () => {}),
    getAccountId: vi.fn(async () => 'account-id'),
    claimOutboxJobs: vi.fn(async () => []),
    markOutboxSent: vi.fn(async () => {}),
    markOutboxSentWithMessageUpdate: vi.fn(async () => {}),
    markOutboxFailed: vi.fn(async () => {}),
    checkDisconnectRequested: vi.fn(async () => false),
    clearDisconnectRequest: vi.fn(async () => {}),
  }
}

function makeInboxRepo(): InboxRepository {
  return {
    resolveContact: vi.fn(async () => 'contact-id'),
    resolveConversation: vi.fn(async () => 'conv-id'),
    insertInboundMessage: vi.fn(async () => 'msg-id'),
    updateMessageStatus: vi.fn(async () => {}),
    markMessageSent: vi.fn(async () => {}),
  } as unknown as InboxRepository
}

function makeManager(
  provider: WhatsAppProvider,
  sessionStore: WhatsAppSessionStore,
  repo: ReturnType<typeof makeRepo>,
  inboxRepo?: InboxRepository,
) {
  return new ConnectionManager({
    provider,
    sessionStore,
    repo: repo as never,
    inboxRepo: inboxRepo ?? makeInboxRepo(),
    whatsappAccountId: 'wa-account-id',
    accountId: 'account-id',
    workerId: 'worker-1',
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConnectionManager', () => {
  beforeEach(() => { vi.useFakeTimers() })

  it('starts, acquires lock, and initializes provider', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    const repo = makeRepo()
    const mgr = makeManager(provider, store, repo)

    await mgr.start()

    expect(repo.claimLock).toHaveBeenCalledWith('wa-account-id', 'worker-1')
    expect(provider.initialize).toHaveBeenCalledWith(null)
    expect(provider.connect).toHaveBeenCalled()
  })

  it('throws when lock is already held by another worker', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    const repo = makeRepo(false)
    const mgr = makeManager(provider, store, repo)

    await expect(mgr.start()).rejects.toThrow('lock')
  })

  it('loads persisted session and passes it to provider', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    const savedAuth: AuthState = { creds: { registered: true }, keys: {} }
    ;(store.load as ReturnType<typeof vi.fn>).mockResolvedValue(savedAuth)
    const repo = makeRepo()
    const mgr = makeManager(provider, store, repo)

    await mgr.start()

    expect(provider.initialize).toHaveBeenCalledWith(savedAuth)
  })

  it('schedules reconnect on RECONNECTING state', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    const repo = makeRepo()
    const mgr = makeManager(provider, store, repo)
    await mgr.start()

    provider._emit({ type: 'state_changed', state: 'CONNECTED' })
    await Promise.resolve()
    provider._emit({ type: 'state_changed', state: 'RECONNECTING' })
    await Promise.resolve()

    expect(mgr.getState()).toBe('RECONNECTING')
    await vi.advanceTimersByTimeAsync(1_500)
    expect(provider.connect).toHaveBeenCalledTimes(2)
  })

  it('does NOT reconnect on LOGGED_OUT — clears session', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    ;(store.load as ReturnType<typeof vi.fn>).mockResolvedValue({ creds: {}, keys: {} })
    const repo = makeRepo()
    const mgr = makeManager(provider, store, repo)
    await mgr.start()

    provider._emit({ type: 'logged_out' })
    await Promise.resolve()

    expect(store.clear).toHaveBeenCalled()
    expect(mgr.getState()).toBe('LOGGED_OUT')

    await vi.advanceTimersByTimeAsync(65_000)
    expect(provider.connect).toHaveBeenCalledTimes(1)
  })

  it('persists session immediately on auth_state_updated', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    const repo = makeRepo()
    const mgr = makeManager(provider, store, repo)
    await mgr.start()

    const newAuth: AuthState = { creds: { registered: true, me: { id: 'test' } }, keys: { 'pre-key': { '0': {} } } }
    provider._emit({ type: 'auth_state_updated', authState: newAuth })
    await Promise.resolve()

    expect(store.save).toHaveBeenCalledWith('wa-account-id', newAuth)
  })

  it('releases lock on stop', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    const repo = makeRepo()
    const mgr = makeManager(provider, store, repo)
    await mgr.start()
    await mgr.stop()

    expect(repo.releaseLock).toHaveBeenCalledWith('wa-account-id', 'worker-1')
  })

  it('routes message_received to inboxRepo', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    const repo = makeRepo()
    const inboxRepo = makeInboxRepo()
    const mgr = makeManager(provider, store, repo, inboxRepo)
    await mgr.start()

    provider._emit({
      type: 'message_received',
      message: {
        messageId: 'wamid-abc',
        from: '919999999999@s.whatsapp.net',
        body: 'Hello',
        contentType: 'text',
        timestamp: 1700000000,
      },
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(inboxRepo.resolveContact).toHaveBeenCalledWith('account-id', '919999999999@s.whatsapp.net', null)
    expect(inboxRepo.resolveConversation).toHaveBeenCalledWith('account-id', 'contact-id')
    expect(inboxRepo.insertInboundMessage).toHaveBeenCalled()
  })

  it('routes message_status to inboxRepo.updateMessageStatus', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    const repo = makeRepo()
    const inboxRepo = makeInboxRepo()
    const mgr = makeManager(provider, store, repo, inboxRepo)
    await mgr.start()

    provider._emit({ type: 'message_status', messageId: 'wamid-abc', status: 'read' })
    await Promise.resolve()

    expect(inboxRepo.updateMessageStatus).toHaveBeenCalledWith('wamid-abc', 'read')
  })

  it('checkDisconnectCommand calls provider.logout when requested', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    ;(store.load as ReturnType<typeof vi.fn>).mockResolvedValue({ creds: {}, keys: {} })
    const repo = makeRepo()
    ;(repo.checkDisconnectRequested as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    const mgr = makeManager(provider, store, repo)
    await mgr.start()

    await mgr.checkDisconnectCommand()

    expect(repo.clearDisconnectRequest).toHaveBeenCalledWith('wa-account-id')
    expect(provider.logout).toHaveBeenCalled()
  })

  it('temporary disconnect does NOT clear session', async () => {
    const provider = makeProvider()
    const store = makeSessionStore()
    ;(store.load as ReturnType<typeof vi.fn>).mockResolvedValue({ creds: { registered: true }, keys: {} })
    const repo = makeRepo()
    const mgr = makeManager(provider, store, repo)
    await mgr.start()

    // Temporary disconnect (not logout)
    provider._emit({ type: 'state_changed', state: 'RECONNECTING' })
    await Promise.resolve()

    expect(store.clear).not.toHaveBeenCalled()
    expect(mgr.getState()).toBe('RECONNECTING')
  })
})
