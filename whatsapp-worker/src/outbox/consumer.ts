import type { WhatsAppProvider } from '../provider/adapter.js'
import type { WhatsAppRepository } from '../repository/index.js'
import type { OutboxJob } from './types.js'
import { logger } from '../logger.js'
import { config } from '../config.js'

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
      // Recover stale locks every ~5 minutes (every 150 polls at 2s interval).
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

        // Phase F — configurable inter-message delay.
        // For broadcast jobs: use the broadcast's send_interval_ms.
        // For normal single-message jobs or the last job in a batch: no delay.
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

  /**
   * Determine the inter-message delay to apply after this job.
   * Broadcast jobs use their broadcast's send_interval_ms.
   * Single-message (non-broadcast) jobs use no additional delay.
   */
  private async resolveDelay(job: OutboxJob): Promise<number> {
    if (job.broadcast_id) {
      // Try to read the per-broadcast interval; fall back to the global default.
      const stored = await this.repo.getBroadcastSendIntervalMs(job.broadcast_id)
      return stored ?? config.outbox.broadcastSendIntervalMs
    }
    return 0
  }

  private async process(job: OutboxJob): Promise<void> {
    logger.info('outbox_job_claimed', { jobId: job.id, type: job.message_type, attempt: job.attempts })

    // Phase H — broadcast state check.
    // Before sending, verify the broadcast is still eligible (not paused/cancelled).
    if (job.broadcast_id) {
      const eligible = await this.repo.isBroadcastEligibleToSend(job.broadcast_id)
      if (!eligible) {
        logger.info('outbox_job_skipped_broadcast_state', { jobId: job.id, broadcastId: job.broadcast_id })
        // Return the job to pending so it can be retried if the broadcast is resumed.
        // For cancelled broadcasts the job will stay pending; the cancel API
        // sets pending outbox jobs to 'cancelled' directly.
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
        // Mirror success onto broadcast_recipients so the detail page shows 'sent'.
        if (job.broadcast_recipient_id) {
          await this.repo.updateBroadcastRecipientStatus(job.broadcast_recipient_id, 'sent')
        }
        logger.info('outbox_job_completed', { jobId: job.id, messageId: result.messageId })
      } else {
        const exhausted = job.attempts >= job.max_attempts
        await this.repo.markOutboxFailed(job.id, result.error ?? 'Unknown error', exhausted)
        if (job.broadcast_recipient_id && exhausted) {
          await this.repo.updateBroadcastRecipientStatus(
            job.broadcast_recipient_id,
            'failed',
            { error: result.error ?? 'Unknown error' },
          )
        }
        logger.warn('outbox_job_failed', { jobId: job.id, error: result.error, exhausted })
      }
    } catch (err) {
      const exhausted = job.attempts >= job.max_attempts
      await this.repo.markOutboxFailed(job.id, String(err), exhausted)
      if (job.broadcast_recipient_id && exhausted) {
        await this.repo.updateBroadcastRecipientStatus(
          job.broadcast_recipient_id,
          'failed',
          { error: String(err) },
        )
      }
      logger.error('outbox_job_failed', { jobId: job.id, error: String(err), exhausted })
    }
  }
}
