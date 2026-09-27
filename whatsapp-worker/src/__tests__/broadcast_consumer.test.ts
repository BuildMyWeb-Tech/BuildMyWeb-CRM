/**
 * Phase K — Broadcast consumer tests (I-J).
 * Covers: pacing, eligibility check, recipient status mirroring,
 * delivery tracking, retry classification, pause race, cancel race,
 * restart safety, duplicate-send protection.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.WHATSAPP_WORKER_ID = 'test-worker'
process.env.WHATSAPP_ACCOUNT_ID = 'test-account'
process.env.WHATSAPP_SESSION_ENCRYPTION_KEY = 'a'.repeat(64)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OutboxConsumer, isPermanentFailure } from '../outbox/consumer.js'
import type { WhatsAppProvider, SendResult } from '../provider/adapter.js'
import type { ConnectionState } from '../connection/states.js'
import type { OutboxJob } from '../outbox/types.js'

// ── Test doubles ──────────────────────────────────────────────────────────────

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
    sendText: vi.fn(async (): Promise<SendResult> => ({ messageId: 'wamid-1', status: 'sent' })),
    sendMedia: vi.fn(async (): Promise<SendResult> => ({ messageId: 'wamid-media', status: 'sent' })),
    markRead: vi.fn(async () => {}),
  }
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    claimOutboxJobs: vi.fn(async (): Promise<OutboxJob[]> => []),
    markOutboxSentWithMessageUpdate: vi.fn(async () => {}),
    markOutboxFailed: vi.fn(async () => {}),
    recoverStaleOutboxJobs: vi.fn(async () => 0),
    getBroadcastSendIntervalMs: vi.fn(async () => null as number | null),
    isBroadcastEligibleToSend: vi.fn(async () => true),
    updateBroadcastRecipientStatus: vi.fn(async () => {}),
    storeOutboxSentMessageId: vi.fn(async () => {}),
    returnOutboxJobToPending: vi.fn(async () => {}),
    ...overrides,
  }
}

function makeJob(overrides: Partial<OutboxJob> = {}): OutboxJob {
  return {
    id: 'job-bc-1',
    account_id: 'acc-1',
    whatsapp_account_id: 'wa-1',
    conversation_id: null,
    message_id: null,
    recipient: '+919900000001',
    message_type: 'text',
    payload: { text: 'Hello broadcast' },
    status: 'processing',
    attempts: 1,
    max_attempts: 3,
    idempotency_key: 'broadcast:bc-1:recipient:rcp-1',
    scheduled_at: new Date().toISOString(),
    locked_at: new Date().toISOString(),
    locked_by: 'test-worker',
    processed_at: null,
    error: null,
    broadcast_id: 'bc-1',
    broadcast_recipient_id: 'rcp-1',
    sent_message_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

async function runPoll(consumer: OutboxConsumer) {
  await (consumer as unknown as { poll(): Promise<void> }).poll()
}

// ── isPermanentFailure ────────────────────────────────────────────────────────

describe('isPermanentFailure', () => {
  it('returns true for invalid number errors', () => {
    expect(isPermanentFailure('invalid number')).toBe(true)
    expect(isPermanentFailure('Number does not exist')).toBe(true)
    expect(isPermanentFailure('not registered')).toBe(true)
  })

  it('returns true for media errors', () => {
    expect(isPermanentFailure('unsupported media type')).toBe(true)
    expect(isPermanentFailure('media too large')).toBe(true)
  })

  it('returns false for transient errors', () => {
    expect(isPermanentFailure('Connection timeout')).toBe(false)
    expect(isPermanentFailure('Network error')).toBe(false)
    expect(isPermanentFailure('socket hung up')).toBe(false)
  })
})

// ── Broadcast eligibility (Phase H/J-9) ────────────────────────────────────

describe('OutboxConsumer — broadcast eligibility', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('J-9: returns job to pending when broadcast is paused', async () => {
    const provider = makeProvider()
    const repo = makeRepo({ isBroadcastEligibleToSend: vi.fn(async () => false) })
    const job = makeJob()
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    // Must return to pending — NOT leave stuck in processing.
    expect(repo.returnOutboxJobToPending).toHaveBeenCalledWith('job-bc-1')
    // Must NOT send.
    expect(provider.sendText).not.toHaveBeenCalled()
    expect(repo.markOutboxSentWithMessageUpdate).not.toHaveBeenCalled()
  })

  it('J-10: does not send a cancelled broadcast job', async () => {
    const provider = makeProvider()
    const repo = makeRepo({ isBroadcastEligibleToSend: vi.fn(async () => false) })
    const job = makeJob()
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(provider.sendText).not.toHaveBeenCalled()
  })

  it('sends normally when broadcast is eligible', async () => {
    const provider = makeProvider()
    const repo = makeRepo()
    const job = makeJob()
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(provider.sendText).toHaveBeenCalledOnce()
    expect(repo.returnOutboxJobToPending).not.toHaveBeenCalled()
  })
})

// ── wamid storage (Phase I-3) ─────────────────────────────────────────────────

describe('OutboxConsumer — wamid storage for delivery tracking', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('I-3: stores wamid on outbox row after successful broadcast send', async () => {
    const provider = makeProvider()
    const repo = makeRepo()
    const job = makeJob()
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(repo.storeOutboxSentMessageId).toHaveBeenCalledWith('job-bc-1', 'wamid-1')
  })

  it('does NOT store wamid for non-broadcast (message_id-linked) jobs', async () => {
    const provider = makeProvider()
    const repo = makeRepo()
    // Non-broadcast job: broadcast_id is null
    const job = makeJob({ broadcast_id: null, broadcast_recipient_id: null, message_id: 'crm-msg-1' })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(repo.storeOutboxSentMessageId).not.toHaveBeenCalled()
  })
})

// ── Recipient status mirroring (Phase D/I) ────────────────────────────────────

describe('OutboxConsumer — recipient status mirroring', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('mirrors sent status after successful send', async () => {
    const provider = makeProvider()
    const repo = makeRepo()
    const job = makeJob()
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(repo.updateBroadcastRecipientStatus).toHaveBeenCalledWith('rcp-1', 'sent')
  })

  it('mirrors failed status after exhausted retries', async () => {
    const provider = makeProvider()
    ;(provider.sendText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      messageId: '', status: 'failed', error: 'Connection timeout',
    })
    const repo = makeRepo()
    // attempts = max_attempts so it is exhausted
    const job = makeJob({ attempts: 3, max_attempts: 3 })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(repo.updateBroadcastRecipientStatus).toHaveBeenCalledWith('rcp-1', 'failed', expect.objectContaining({ error: expect.any(String) }))
  })

  it('does NOT mirror failed on a retryable attempt (not yet exhausted)', async () => {
    const provider = makeProvider()
    ;(provider.sendText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      messageId: '', status: 'failed', error: 'Connection timeout',
    })
    const repo = makeRepo()
    const job = makeJob({ attempts: 1, max_attempts: 3 })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(repo.updateBroadcastRecipientStatus).not.toHaveBeenCalled()
  })
})

// ── Retry classification (Phase J-4) ─────────────────────────────────────────

describe('OutboxConsumer — retry classification (J-4)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('immediately exhausts attempts on permanent failure (invalid number)', async () => {
    const provider = makeProvider()
    ;(provider.sendText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      messageId: '', status: 'failed', error: 'invalid number',
    })
    const repo = makeRepo()
    const job = makeJob({ attempts: 1, max_attempts: 3 })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    // markOutboxFailed called with cancel=true (permanent)
    expect(repo.markOutboxFailed).toHaveBeenCalledWith('job-bc-1', 'invalid number', true)
    // Recipient status mirrored as failed immediately (not waiting for max_attempts)
    expect(repo.updateBroadcastRecipientStatus).toHaveBeenCalledWith('rcp-1', 'failed', expect.any(Object))
  })

  it('does NOT exhaust attempts on transient failure when below max', async () => {
    const provider = makeProvider()
    ;(provider.sendText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      messageId: '', status: 'failed', error: 'Connection timeout',
    })
    const repo = makeRepo()
    const job = makeJob({ attempts: 1, max_attempts: 3 })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    expect(repo.markOutboxFailed).toHaveBeenCalledWith('job-bc-1', 'Connection timeout', false)
    expect(repo.updateBroadcastRecipientStatus).not.toHaveBeenCalled()
  })
})

// ── Pacing (Phase F) ──────────────────────────────────────────────────────────

describe('OutboxConsumer — pacing (Phase F)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('applies per-broadcast send_interval_ms between jobs', async () => {
    const provider = makeProvider()
    const repo = makeRepo({
      getBroadcastSendIntervalMs: vi.fn(async () => 500),
    })
    const job1 = makeJob({ id: 'job-1' })
    const job2 = makeJob({ id: 'job-2' })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job1, job2])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)

    const pollPromise = runPoll(consumer)
    // Advance past first send
    await vi.advanceTimersByTimeAsync(600)
    await pollPromise

    expect(repo.getBroadcastSendIntervalMs).toHaveBeenCalledWith('bc-1')
    // Two sends happened
    expect(provider.sendText).toHaveBeenCalledTimes(2)
  })
})

// ── One failure must not stop others (Phase J-5) ──────────────────────────────

describe('OutboxConsumer — resilience across recipients', () => {
  // Use real timers — fake timers + async delays inside the poll loop cause timeouts.
  it('continues processing remaining jobs after one recipient fails', async () => {
    const provider = makeProvider()
    // null interval = no delay, so the poll finishes quickly
    ;(provider.sendText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ messageId: '', status: 'failed', error: 'Connection timeout' })
      .mockResolvedValueOnce({ messageId: 'wamid-2', status: 'sent' })

    const repo = makeRepo({
      getBroadcastSendIntervalMs: vi.fn(async () => 0), // no delay
    })
    const job1 = makeJob({ id: 'job-1', broadcast_recipient_id: 'rcp-1', attempts: 3, max_attempts: 3 })
    const job2 = makeJob({ id: 'job-2', broadcast_recipient_id: 'rcp-2' })
    ;(repo.claimOutboxJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([job1, job2])

    const consumer = new OutboxConsumer(provider, repo as never, 'wa-1', 'w-1', 2000)
    await runPoll(consumer)

    // Both jobs were attempted
    expect(provider.sendText).toHaveBeenCalledTimes(2)
    // Second job succeeded
    expect(repo.markOutboxSentWithMessageUpdate).toHaveBeenCalledWith('job-2', null, 'wamid-2')
  }, 10000)
})
