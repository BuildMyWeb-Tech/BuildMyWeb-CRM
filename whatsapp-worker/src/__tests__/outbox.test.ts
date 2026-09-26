process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.WHATSAPP_WORKER_ID = 'test-worker'
process.env.WHATSAPP_ACCOUNT_ID = 'test-account'
process.env.WHATSAPP_SESSION_ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OutboxConsumer } from '../outbox/consumer.js'
import type {
  WhatsAppProvider,
  MediaPayload,
  SendResult,
} from '../provider/adapter.js'
import type { ConnectionState } from '../connection/states.js'
import type { OutboxJob } from '../outbox/types.js'

// ── Test doubles ───────────────────────────────────────────────────────────────

function makeProvider(connected = true): WhatsAppProvider {
  const state: ConnectionState = connected ? 'CONNECTED' : 'DISCONNECTED'
  return {
    onEvent: vi.fn(),
    initialize: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    getConnectionState: () => state,
    getQRCode: () => null,
    sendText: vi.fn(async (_jid: string, _text: string): Promise<SendResult> => ({
      messageId: 'wamid-sent',
      status: 'sent',
    })),
    sendMedia: vi.fn(async (_jid: string, _m: MediaPayload): Promise<SendResult> => ({
      messageId: 'wamid-media',
      status: 'sent',
    })),
    markRead: vi.fn(async () => {}),
  }
}

function makeRepo() {
  return {
    claimOutboxJobs: vi.fn(async (): Promise<OutboxJob[]> => []),
    markOutboxSentWithMessageUpdate: vi.fn(async () => {}),
    markOutboxFailed: vi.fn(async () => {}),
    recoverStaleOutboxJobs: vi.fn(async () => 0),
  }
}

function makeJob(overrides: Partial<OutboxJob> = {}): OutboxJob {
  return {
    id: 'job-1',
    account_id: 'account-1',
    whatsapp_account_id: 'wa-account-1',
    conversation_id: 'conv-1',
    message_id: 'crm-msg-1',
    recipient: '+919999999999',
    message_type: 'text',
    payload: { text: 'Hello from CRM' },
    status: 'processing',
    attempts: 1,
    max_attempts: 3,
    idempotency_key: 'idem-1',
    scheduled_at: new Date().toISOString(),
    locked_at: new Date().toISOString(),
    locked_by: 'test-worker',
    processed_at: null,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

async function runPoll(consumer: OutboxConsumer) {
  // Access private poll via any-cast.
  await (consumer as unknown as { poll(): Promise<void> }).poll()
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('OutboxConsumer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('does not poll when provider is not CONNECTED', async () => {
    const provider = makeProvider(false)
    const repo = makeRepo()
    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)

    await runPoll(consumer)

    expect(repo.claimOutboxJobs).not.toHaveBeenCalled()
  })

  it('claims and sends a text job — marks sent with wamid', async () => {
    const provider = makeProvider()
    const repo = makeRepo()
    const job = makeJob()
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    // sendText must be called with correct JID (phone → @s.whatsapp.net)
    expect(provider.sendText).toHaveBeenCalledWith('919999999999@s.whatsapp.net', 'Hello from CRM')
    // CRM message row updated with wamid
    expect(repo.markOutboxSentWithMessageUpdate).toHaveBeenCalledWith('job-1', 'crm-msg-1', 'wamid-sent')
    expect(repo.markOutboxFailed).not.toHaveBeenCalled()
  })

  it('normalizes JID: strips non-digits from phone, appends @s.whatsapp.net', async () => {
    const provider = makeProvider()
    const repo = makeRepo()
    const job = makeJob({ recipient: '+44 7911 123456' })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(provider.sendText).toHaveBeenCalledWith('447911123456@s.whatsapp.net', expect.any(String))
  })

  it('recipient already has @ — used as-is (no double @s.whatsapp.net)', async () => {
    const provider = makeProvider()
    const repo = makeRepo()
    const job = makeJob({ recipient: '919999999999@s.whatsapp.net' })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(provider.sendText).toHaveBeenCalledWith('919999999999@s.whatsapp.net', expect.any(String))
  })

  it('failed send — marks job failed, does not mark sent', async () => {
    const provider = makeProvider()
    ;(provider.sendText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      messageId: '',
      status: 'failed',
      error: 'Not connected',
    })
    const repo = makeRepo()
    const job = makeJob()
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(repo.markOutboxSentWithMessageUpdate).not.toHaveBeenCalled()
    expect(repo.markOutboxFailed).toHaveBeenCalledWith('job-1', 'Not connected', false)
  })

  it('max attempts reached — job is cancelled (cancel=true)', async () => {
    const provider = makeProvider()
    ;(provider.sendText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      messageId: '',
      status: 'failed',
      error: 'Timeout',
    })
    const repo = makeRepo()
    const job = makeJob({ attempts: 3, max_attempts: 3 })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(repo.markOutboxFailed).toHaveBeenCalledWith('job-1', 'Timeout', true)
  })

  it('sendText throws — job marked failed, consumer continues', async () => {
    const provider = makeProvider()
    ;(provider.sendText as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Socket closed'))
      .mockResolvedValueOnce({ messageId: 'wamid-2', status: 'sent' })

    const repo = makeRepo()
    const job1 = makeJob({ id: 'job-1' })
    const job2 = makeJob({ id: 'job-2', message_id: 'crm-msg-2' })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([job1, job2])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)

    // Temporarily disable the inter-message delay for this test.
    await (consumer as unknown as { process(j: OutboxJob): Promise<void> }).process(job1)
    await (consumer as unknown as { process(j: OutboxJob): Promise<void> }).process(job2)

    // job1 failed, job2 succeeded
    expect(repo.markOutboxFailed).toHaveBeenCalledWith('job-1', expect.stringContaining('Socket closed'), false)
    expect(repo.markOutboxSentWithMessageUpdate).toHaveBeenCalledWith('job-2', 'crm-msg-2', 'wamid-2')
  })

  it('media job uses sendMedia', async () => {
    const provider = makeProvider()
    const repo = makeRepo()
    const job = makeJob({
      message_type: 'image',
      payload: { url: 'https://example.com/img.jpg', mimetype: 'image/jpeg', caption: 'Look' },
    })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(provider.sendMedia).toHaveBeenCalled()
    expect(provider.sendText).not.toHaveBeenCalled()
  })

  it('broadcast: 3 recipients all sent, one failure does not stop others', async () => {
    const provider = makeProvider()
    ;(provider.sendText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ messageId: 'wa-1', status: 'sent' })
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce({ messageId: 'wa-3', status: 'sent' })

    const repo = makeRepo()

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)

    for (const [id, recipient] of [['j-1', '+911111111111'], ['j-2', '+922222222222'], ['j-3', '+933333333333']]) {
      const job = makeJob({ id, recipient, message_id: `msg-${id}` })
      await (consumer as unknown as { process(j: OutboxJob): Promise<void> }).process(job)
    }

    expect(repo.markOutboxSentWithMessageUpdate).toHaveBeenCalledTimes(2)
    expect(repo.markOutboxFailed).toHaveBeenCalledTimes(1)
    expect((repo.markOutboxFailed as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('j-2')
  })
})
