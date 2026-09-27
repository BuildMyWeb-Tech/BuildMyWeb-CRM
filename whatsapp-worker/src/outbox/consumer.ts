import type { WhatsAppProvider } from '../provider/adapter.js'
import type { WhatsAppRepository } from '../repository/index.js'
import type { OutboxJob } from './types.js'
import { logger } from '../logger.js'
import { config } from '../config.js'

// ── Retry classification ────────────────────────────────────────────────────
//
// Transient errors are temporary (network, timeout, provider transient reject).
// Permanent errors indicate the recipient or message is definitively invalid.
//
// Only transient errors are retried; permanent errors immediately exhaust attempts
// so failed_count is updated without burning through max_attempts.
//
// NOTE: pacing/intervals are reliability/throughput controls, not evasion tools.
// Do NOT add timing intended to bypass WhatsApp rate-limiting or anti-spam.

const PERMANENT_ERROR_PATTERNS = [
  /invalid.*number/i,
  /not.*registered/i,
  /number.*does not exist/i,
  /unsupported.*media/i,
  /media.*too large/i,
  /invalid.*jid/i,
  /blocked/i,
]

export function isPermanentFailure(error: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some((p) => p.test(error))
}

export class OutboxConsumer {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private readonly provider: WhatsAppProvider,
    private readonly repo: WhatsAppRepository,
    private readonly whatsappAccountId: string,
    private readonly workerId: string,
    private readonly pollIntervalMs: number,
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private pollCount = 0

  private async poll(): Promise<void> {
    if (this.running) return
    if (this.provider.getConnectionState() !== 'CONNECTED') return
    this.running = true
    try {
      this.pollCount++
      if (this.pollCount % 150 === 1) {
        await this.repo.recoverStaleOutboxJobs().catch(() => {})
      }

      const jobs = await this.repo.claimOutboxJobs(
        this.whatsappAccountId,
        this.workerId,
      )

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]
        await this.process(job)

        // Phase F: configurable inter-message delay for broadcast jobs.
        // Exists for queue stability and responsible throughput, NOT evasion.
        if (i < jobs.length - 1) {
          const delayMs = await this.resolveDelay(job)
          if (delayMs > 0) {
            await new Promise<void>((r) => setTimeout(r, delayMs))
          }
        }
      }
    } finally {
      this.running = false
    }
  }

  private async resolveDelay(job: OutboxJob): Promise<number> {
    if (job.broadcast_id) {
      const stored = await this.repo.getBroadcastSendIntervalMs(job.broadcast_id)
      return stored ?? config.outbox.broadcastSendIntervalMs
    }
    return 0
  }

  private async process(job: OutboxJob): Promise<void> {
    logger.info('outbox_job_claimed', {
      jobId: job.id,
      type: job.message_type,
      attempt: job.attempts,
      broadcastId: job.broadcast_id ?? undefined,
      broadcastRecipientId: job.broadcast_recipient_id ?? undefined,
    })

    // Phase H: check broadcast eligibility before sending.
    // If the broadcast was paused/cancelled AFTER this job was claimed,
    // return the job to 'pending' rather than leaving it stuck in 'processing'.
    if (job.broadcast_id) {
      const eligible = await this.repo.isBroadcastEligibleToSend(job.broadcast_id)
      if (!eligible) {
        logger.info('outbox_job_returned_paused_broadcast', {
          jobId: job.id,
          broadcastId: job.broadcast_id,
        })
        await this.repo.returnOutboxJobToPending(job.id)
        return
      }
    }

    try {
      const jid = job.recipient.includes('@')
        ? job.recipient
        : `${job.recipient.replace(/\D/g, '')}@s.whatsapp.net`

      let result
      if (job.message_type === 'text') {
        result = await this.provider.sendText(jid, String(job.payload.text ?? ''))
      } else {
        result = await this.provider.sendMedia(jid, {
          type: job.message_type as never,
          url: job.payload.url as string | undefined,
          mimetype: String(job.payload.mimetype ?? 'application/octet-stream'),
          caption: job.payload.caption as string | undefined,
          filename: job.payload.filename as string | undefined,
        })
      }

      if (result.status === 'sent') {
        await this.repo.markOutboxSentWithMessageUpdate(job.id, job.message_id, result.messageId)

        // Store the wamid on the outbox row so delivery/read receipt events
        // (which only carry the wamid) can be mapped back to broadcast_recipient_id.
        if (job.broadcast_id && result.messageId) {
          await this.repo.storeOutboxSentMessageId(job.id, result.messageId)
        }

        // Mirror success onto broadcast_recipients.
        if (job.broadcast_recipient_id) {
          await this.repo.updateBroadcastRecipientStatus(job.broadcast_recipient_id, 'sent')
        }

        logger.info('outbox_job_completed', {
          jobId: job.id,
          messageId: result.messageId,
          broadcastId: job.broadcast_id ?? undefined,
          recipientId: job.broadcast_recipient_id ?? undefined,
        })
      } else {
        const errorMsg = result.error ?? 'Unknown error'
        // Permanent failures exhaust attempts immediately — no point retrying.
        const exhausted = job.attempts >= job.max_attempts || isPermanentFailure(errorMsg)
        await this.repo.markOutboxFailed(job.id, errorMsg, exhausted)
        if (job.broadcast_recipient_id && exhausted) {
          await this.repo.updateBroadcastRecipientStatus(
            job.broadcast_recipient_id,
            'failed',
            { error: errorMsg },
          )
        }
        logger.warn('outbox_job_failed', {
          jobId: job.id,
          error: errorMsg,
          exhausted,
          permanent: isPermanentFailure(errorMsg),
          broadcastId: job.broadcast_id ?? undefined,
          recipientId: job.broadcast_recipient_id ?? undefined,
        })
      }
    } catch (err) {
      const errorMsg = String(err)
      const exhausted = job.attempts >= job.max_attempts || isPermanentFailure(errorMsg)
      await this.repo.markOutboxFailed(job.id, errorMsg, exhausted)
      if (job.broadcast_recipient_id && exhausted) {
        await this.repo.updateBroadcastRecipientStatus(
          job.broadcast_recipient_id,
          'failed',
          { error: errorMsg },
        )
      }
      logger.error('outbox_job_failed', {
        jobId: job.id,
        error: errorMsg,
        exhausted,
        broadcastId: job.broadcast_id ?? undefined,
        recipientId: job.broadcast_recipient_id ?? undefined,
      })
    }
  }
}
