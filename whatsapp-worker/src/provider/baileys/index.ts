/**
 * Baileys provider adapter — wraps @whiskeysockets/baileys behind
 * the WhatsAppProvider interface so no other file imports Baileys directly.
 */
// @ts-ignore — qrcode types may not be installed; we handle missing module at runtime
import makeWASocket, {
  initAuthCreds,
  DisconnectReason,
  type WASocket,
  type AuthenticationState,
  type BaileysEventMap,
  makeCacheableSignalKeyStore,
  type ConnectionState as BaileysConnectionState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'

import type {
  WhatsAppProvider,
  AuthState,
  MediaPayload,
  SendResult,
  ProviderEventHandler,
  ProviderEvent,
} from '../adapter.js'
import type { ConnectionState } from '../../connection/states.js'
import { logger } from '../../logger.js'

const noopLogger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
}

export class BaileysProvider implements WhatsAppProvider {
  private socket: WASocket | null = null
  private state: ConnectionState = 'DISCONNECTED'
  private qrDataUri: string | null = null
  private handler: ProviderEventHandler | null = null

  // Persisted credentials (device identity). Null = fresh session needing QR.
  private savedCreds: Record<string, unknown> | null = null

  // Signal Protocol keys — mutated in-place by Baileys' set() callback so
  // snapshotAuthState always reads the current state without needing a proxy.
  private keysData: Record<string, Record<string, unknown>> = {}

  onEvent(handler: ProviderEventHandler): void {
    this.handler = handler
  }

  private emit(event: ProviderEvent) {
    this.handler?.(event)
  }

  private setState(next: ConnectionState) {
    if (this.state === next) return
    this.state = next
    if (next !== 'QR_REQUIRED') this.qrDataUri = null
    logger.info('connection_state_changed', { state: next })
    this.emit({ type: 'state_changed', state: next })
  }

  async initialize(authState: AuthState | null): Promise<void> {
    if (authState) {
      this.savedCreds = authState.creds
      this.keysData = (authState.keys ?? {}) as Record<string, Record<string, unknown>>
    } else {
      this.savedCreds = null
      this.keysData = {}
    }
  }

  async connect(): Promise<void> {
    if (this.socket) return

    this.setState('STARTING')

    // Build Baileys AuthenticationState entirely in memory.
    // savedCreds=null → fresh session → Baileys emits QR.
    // savedCreds set  → restored session → Baileys reconnects without QR.
    const baileysAuthState = this.buildBaileysAuthState()

    this.socket = makeWASocket({
      auth: {
        creds: baileysAuthState.creds,
        keys: makeCacheableSignalKeyStore(baileysAuthState.keys, noopLogger as never),
      },
      printQRInTerminal: false,
      logger: noopLogger as never,
      keepAliveIntervalMs: 10_000,
      connectTimeoutMs: 60_000,
    })

    this.wireEvents(this.socket, baileysAuthState)
    this.setState('AUTHENTICATING')
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return
    this.socket.end(undefined)
    this.socket = null
    this.setState('DISCONNECTED')
  }

  async logout(): Promise<void> {
    if (this.socket) {
      try { await this.socket.logout() } catch { /* ignore — socket may already be dead */ }
      this.socket = null
    }
    this.savedCreds = null
    this.keysData = {}
    this.setState('LOGGED_OUT')
    this.emit({ type: 'logged_out' })
  }

  getConnectionState(): ConnectionState {
    return this.state
  }

  getQRCode(): string | null {
    return this.qrDataUri
  }

  async sendText(jid: string, text: string): Promise<SendResult> {
    if (!this.socket || this.state !== 'CONNECTED') {
      return { messageId: '', status: 'failed', error: 'Not connected' }
    }
    try {
      const result = await this.socket.sendMessage(jid, { text })
      return { messageId: result?.key?.id ?? '', status: 'sent' }
    } catch (err) {
      return { messageId: '', status: 'failed', error: String(err) }
    }
  }

  async sendMedia(jid: string, media: MediaPayload): Promise<SendResult> {
    if (!this.socket || this.state !== 'CONNECTED') {
      return { messageId: '', status: 'failed', error: 'Not connected' }
    }
    try {
      const payload: Record<string, unknown> = {
        mimetype: media.mimetype,
        caption: media.caption,
        fileName: media.filename,
      }
      if (media.buffer) payload[media.type] = media.buffer
      else if (media.url) payload.url = media.url
      const result = await this.socket.sendMessage(jid, payload as never)
      return { messageId: result?.key?.id ?? '', status: 'sent' }
    } catch (err) {
      return { messageId: '', status: 'failed', error: String(err) }
    }
  }

  async markRead(jid: string, messageIds: string[]): Promise<void> {
    if (!this.socket || this.state !== 'CONNECTED') return
    const keys = messageIds.map((id) => ({ remoteJid: jid, id, fromMe: false }))
    await this.socket.readMessages(keys)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildBaileysAuthState(): AuthenticationState {
    const creds = this.savedCreds ? (this.savedCreds as never) : initAuthCreds()
    return { creds, keys: this.buildKeyStore() }
  }

  /**
   * In-memory keys store backed by keysData.
   * Baileys calls set() whenever keys change; keysData stays current so
   * snapshotAuthState always captures the complete Signal key material.
   */
  private buildKeyStore() {
    return {
      get: async (type: string, ids: string[]) => {
        const out: Record<string, unknown> = {}
        const store = this.keysData[type] ?? {}
        for (const id of ids) {
          if (store[id] !== undefined) out[id] = store[id]
        }
        return out
      },
      set: async (data: Record<string, Record<string, unknown>>) => {
        for (const [type, vals] of Object.entries(data)) {
          this.keysData[type] ??= {}
          Object.assign(this.keysData[type], vals)
        }
      },
    } as never
  }

  private snapshotAuthState(baileysAuth: AuthenticationState): AuthState {
    return {
      // Spread creds to capture the latest device identity state.
      creds: { ...(baileysAuth.creds as unknown as Record<string, unknown>) },
      // Deep clone keys so the persisted snapshot is immutable.
      keys: JSON.parse(JSON.stringify(this.keysData)) as Record<string, unknown>,
    }
  }

  private wireEvents(sock: WASocket, baileysAuth: AuthenticationState) {
    sock.ev.on('connection.update', (update: Partial<BaileysConnectionState>) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        import('qrcode').then((mod) => {
          const toDataURL: (s: string) => Promise<string> =
            (mod as { toDataURL?: (s: string) => Promise<string> }).toDataURL ??
            (mod as { default?: { toDataURL: (s: string) => Promise<string> } }).default?.toDataURL ??
            (() => Promise.reject(new Error('no toDataURL')))
          return toDataURL(qr)
        }).then((dataUri) => {
          this.qrDataUri = dataUri
          this.setState('QR_REQUIRED')
          this.emit({ type: 'qr', dataUri })
        }).catch(() => {
          this.qrDataUri = qr
          this.setState('QR_REQUIRED')
          this.emit({ type: 'qr', dataUri: qr })
        })
      }

      if (connection === 'open') {
        this.setState('CONNECTED')
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode
        const isAuthFailure =
          reason === DisconnectReason.loggedOut ||
          reason === DisconnectReason.forbidden
        this.socket = null
        if (isAuthFailure) {
          this.setState('LOGGED_OUT')
          this.emit({ type: 'logged_out' })
        } else {
          this.setState('RECONNECTING')
        }
      }
    })

    sock.ev.on('creds.update', () => {
      // Baileys updated device creds — persist creds + keys immediately.
      const snapshot = this.snapshotAuthState(baileysAuth)
      // Update our local creds reference so reconnects use the latest.
      this.savedCreds = snapshot.creds
      this.emit({ type: 'auth_state_updated', authState: snapshot })
    })

    sock.ev.on('messages.upsert', ({ messages }: BaileysEventMap['messages.upsert']) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue

        const body =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          null

        const contentType = body != null ? 'text'
          : msg.message.imageMessage ? 'image'
          : msg.message.documentMessage ? 'document'
          : msg.message.audioMessage ? 'audio'
          : msg.message.videoMessage ? 'video'
          : 'unknown'

        this.emit({
          type: 'message_received',
          message: {
            messageId: msg.key.id ?? '',
            from: msg.key.remoteJid ?? '',
            body,
            contentType,
            timestamp: (msg.messageTimestamp as number) ?? Math.floor(Date.now() / 1000),
          },
        })
      }
    })

    // Delivery / read receipts for outgoing messages.
    sock.ev.on('messages.update', (updates: BaileysEventMap['messages.update']) => {
      for (const update of updates) {
        if (!update.key?.id || !update.key.fromMe) continue
        const statusCode = update.update?.status ?? null
        if (statusCode === null || statusCode === undefined) continue
        const sc = statusCode as number
        // Baileys proto: SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5
        const mapped: 'delivered' | 'read' | 'failed' | null =
          sc >= 4 ? 'read'
          : sc === 3 ? 'delivered'
          : sc === 0 ? 'failed'
          : null
        if (!mapped) continue
        this.emit({
          type: 'message_status',
          messageId: update.key.id,
          status: mapped,
        })
      }
    })
  }
}
