import type { WhatsAppProvider } from '../provider/adapter.js'
import type { WhatsAppRepository } from '../repository/index.js'
import type { OutboxJob } from './types.js'
import { logger } from '../logger.js'

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
      for (const job of jobs) {
        await this.process(job)
        // Conservative inter-message delay for broadcasts — avoids flooding
        // WhatsApp and respects their rate limits (approx 80 msg/min on linked device).
        if (jobs.length > 1) {
          await new Promise<void>((r) => setTimeout(r, 800))
        }
      }
    } finally {
      this.running = false
    }
  }

  private async process(job: OutboxJob): Promise<void> {
    logger.info('outbox_job_claimed', { jobId: job.id, type: job.message_type, attempt: job.attempts })
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
        // Update outbox + linked CRM message row (status → sent, store wamid).
        await this.repo.markOutboxSentWithMessageUpdate(job.id, job.message_id, result.messageId)
        logger.info('outbox_job_completed', { jobId: job.id, messageId: result.messageId })
      } else {
        const exhausted = job.attempts >= job.max_attempts
        await this.repo.markOutboxFailed(job.id, result.error ?? 'Unknown error', exhausted)
        logger.warn('outbox_job_failed', { jobId: job.id, error: result.error, exhausted })
      }
    } catch (err) {
      const exhausted = job.attempts >= job.max_attempts
      await this.repo.markOutboxFailed(job.id, String(err), exhausted)
      logger.error('outbox_job_failed', { jobId: job.id, error: String(err), exhausted })
    }
  }
}
