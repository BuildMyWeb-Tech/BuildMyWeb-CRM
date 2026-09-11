import type { WhatsAppRepository } from '../repository/index.js'
import type { ConnectionManager } from '../connection/manager.js'
import { logger } from '../logger.js'

export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly repo: WhatsAppRepository,
    private readonly connectionManager: ConnectionManager,
    private readonly whatsappAccountId: string,
    private readonly workerId: string,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer) return
    this.beat()
    this.timer = setInterval(() => this.beat(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async beat(): Promise<void> {
    try {
      await this.repo.heartbeat(this.whatsappAccountId, this.workerId)
      logger.debug('heartbeat', { whatsappAccountId: this.whatsappAccountId })
    } catch (err) {
      logger.warn('error', { op: 'heartbeat', message: String(err) })
    }

    // Check for a CRM-initiated disconnect request on every heartbeat.
    try {
      await this.connectionManager.checkDisconnectCommand()
    } catch (err) {
      logger.warn('error', { op: 'disconnect_check', message: String(err) })
    }
  }
}
