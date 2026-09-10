/**
 * ConnectionManager — owns the lifecycle of ONE WhatsApp account connection.
 *
 * Responsibilities:
 *  - acquire/release the DB-backed connection lock
 *  - initialize the provider with the persisted session (or null = QR needed)
 *  - drive reconnect with exponential backoff
 *  - persist session on every auth_state_updated event
 *  - write connection state to DB for the future status UI
 *  - clear session on logout
 */
import type { WhatsAppProvider, ProviderEvent } from '../provider/adapter.js'
import type { WhatsAppSessionStore } from '../session/store.js'
import type { WhatsAppRepository } from '../repository/index.js'
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
  whatsappAccountId: string
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
  private readonly whatsappAccountId: string
  private readonly workerId: string

  constructor(opts: ConnectionManagerOptions) {
    this.provider = opts.provider
    this.sessionStore = opts.sessionStore
    this.repo = opts.repo
    this.whatsappAccountId = opts.whatsappAccountId
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

  getState(): ConnectionState {
    return this.state
  }

  private async connect(): Promise<void> {
    if (this.stopped) return

    // Load persisted session — null means QR will be emitted.
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
        // Persist immediately — ensures no credentials are lost between restarts.
        await this.sessionStore.save(this.whatsappAccountId, event.authState)
        break

      case 'qr':
        // Store QR in DB so the future UI can pick it up.
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

      case 'message_received':
        // Phase 5 will wire incoming messages to conversations/messages tables.
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
      // Don't reconnect — need fresh QR.
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
