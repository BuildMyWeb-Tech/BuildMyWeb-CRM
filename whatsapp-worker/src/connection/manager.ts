/**
 * ConnectionManager — owns the lifecycle of ONE WhatsApp account connection.
 *
 * Responsibilities:
 *  - acquire/release the DB-backed connection lock
 *  - initialize the provider with the persisted session (or null = QR needed)
 *  - drive reconnect with exponential backoff
 *  - persist session on every auth_state_updated event
 *  - write connection state to DB for the QR/status UI
 *  - clear session on logout
 *  - route inbound messages to InboxRepository
 *  - route delivery/read receipts to message status updates
 */
import type { WhatsAppProvider, ProviderEvent } from '../provider/adapter.js'
import type { WhatsAppSessionStore } from '../session/store.js'
import type { WhatsAppRepository } from '../repository/index.js'
import type { InboxRepository } from '../inbox/repository.js'
import {
  type ConnectionState,
  RECONNECTABLE_STATES,
  SESSION_INVALID_STATES,
  backoffDelay,
} from './states.js'
import { logger } from '../logger.js'

export interface ConnectionManagerOptions {
  provider: WhatsAppProvider
  sessionStore: WhatsAppSessionStore
  repo: WhatsAppRepository
  inboxRepo: InboxRepository
  whatsappAccountId: string
  accountId: string
  workerId: string
}

export class ConnectionManager {
  private state: ConnectionState = 'DISCONNECTED'
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  private readonly provider: WhatsAppProvider
  private readonly sessionStore: WhatsAppSessionStore
  private readonly repo: WhatsAppRepository
  private readonly inboxRepo: InboxRepository
  private readonly whatsappAccountId: string
  private readonly accountId: string
  private readonly workerId: string

  constructor(opts: ConnectionManagerOptions) {
    this.provider = opts.provider
    this.sessionStore = opts.sessionStore
    this.repo = opts.repo
    this.inboxRepo = opts.inboxRepo
    this.whatsappAccountId = opts.whatsappAccountId
    this.accountId = opts.accountId
    this.workerId = opts.workerId
  }

  async start(): Promise<void> {
    logger.info('connection_starting', { whatsappAccountId: this.whatsappAccountId })

    const locked = await this.repo.claimLock(this.whatsappAccountId, this.workerId)
    if (!locked) {
      logger.error('error', { op: 'lock', message: 'Another worker holds the connection lock' })
      throw new Error('Connection lock held by another worker instance')
    }
    logger.info('lock_acquired', { whatsappAccountId: this.whatsappAccountId, workerId: this.workerId })

    this.provider.onEvent((event) => this.handleProviderEvent(event))
    await this.connect()
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.clearReconnectTimer()
    await this.provider.disconnect()
    await this.repo.releaseLock(this.whatsappAccountId, this.workerId)
    logger.info('lock_released', { whatsappAccountId: this.whatsappAccountId })
  }

  /** Called by Heartbeat on each beat to handle disconnect commands from CRM. */
  async checkDisconnectCommand(): Promise<void> {
    const requested = await this.repo.checkDisconnectRequested(this.whatsappAccountId)
    if (!requested) return

    logger.info('connection_state_changed', {
      state: 'LOGGED_OUT',
      reason: 'disconnect_requested_by_crm',
    })
    await this.repo.clearDisconnectRequest(this.whatsappAccountId)
    await this.provider.logout()
    // provider.logout() emits logged_out which triggers sessionStore.clear via handleProviderEvent
  }

  getState(): ConnectionState {
    return this.state
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    const authState = await this.sessionStore.load(this.whatsappAccountId)
    await this.provider.initialize(authState)
    await this.provider.connect()
  }

  private async handleProviderEvent(event: ProviderEvent): Promise<void> {
    switch (event.type) {
      case 'state_changed':
        await this.onStateChanged(event.state)
        break

      case 'auth_state_updated':
        await this.sessionStore.save(this.whatsappAccountId, event.authState)
        break

      case 'qr':
        await this.repo.setConnectionState(this.whatsappAccountId, 'QR_REQUIRED', {
          qrDataUri: event.dataUri,
          qrGeneratedAt: new Date().toISOString(),
        })
        break

      case 'logged_out':
        this.state = 'LOGGED_OUT'
        this.clearReconnectTimer()
        await this.sessionStore.clear(this.whatsappAccountId)
        await this.repo.setConnectionState(this.whatsappAccountId, 'LOGGED_OUT', {
          qrDataUri: null,
          lastError: 'Session invalidated by WhatsApp',
        })
        break

      case 'message_received': {
        const msg = event.message
        const contactId = await this.inboxRepo.resolveContact(
          this.accountId,
          msg.from,
          null,
        )
        if (!contactId) break
        const conversationId = await this.inboxRepo.resolveConversation(
          this.accountId,
          contactId,
        )
        if (!conversationId) break
        await this.inboxRepo.insertInboundMessage(conversationId, msg, {
          accountId: this.accountId,
          contactId,
        })
        break
      }

      case 'message_status':
        await this.inboxRepo.updateMessageStatus(event.messageId, event.status)
        break
    }
  }

  private async onStateChanged(next: ConnectionState): Promise<void> {
    const prev = this.state
    this.state = next

    await this.repo.setConnectionState(this.whatsappAccountId, next, {
      reconnectAttempts: this.reconnectAttempts,
    })

    if (next === 'CONNECTED') {
      this.reconnectAttempts = 0
      this.clearReconnectTimer()
      return
    }

    if (RECONNECTABLE_STATES.has(next) && prev === 'CONNECTED') {
      this.scheduleReconnect()
      return
    }

    if (next === 'RECONNECTING') {
      this.scheduleReconnect()
      return
    }

    if (SESSION_INVALID_STATES.has(next)) {
      this.clearReconnectTimer()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return
    this.clearReconnectTimer()
    const delay = backoffDelay(this.reconnectAttempts)
    this.reconnectAttempts++
    logger.info('reconnect_backoff', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
      whatsappAccountId: this.whatsappAccountId,
    })
    this.reconnectTimer = setTimeout(async () => {
      if (this.stopped) return
      logger.info('reconnect_attempt', {
        attempt: this.reconnectAttempts,
        whatsappAccountId: this.whatsappAccountId,
      })
      await this.repo.setConnectionState(this.whatsappAccountId, 'RECONNECTING', {
        reconnectAttempts: this.reconnectAttempts,
      })
      await this.connect()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
