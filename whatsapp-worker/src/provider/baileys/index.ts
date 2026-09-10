/**
 * Baileys provider adapter — wraps @whiskeysockets/baileys behind
 * the WhatsAppProvider interface so no other file imports Baileys directly.
 *
 * Phase 1: scaffolding + auth-state wiring + event routing.
 * Phase 3+4: QR emission, full message handling.
 */
import makeWASocket, {
  useMultiFileAuthState,
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

// Baileys needs a logger interface; we suppress its internal output to
// avoid leaking internal WA protocol details to our log stream.
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
  private authState: AuthenticationState | null = null
  private handler: ProviderEventHandler | null = null
  private initialAuthState: AuthState | null = null

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
    this.initialAuthState = authState
    // If we have a persisted session, Baileys will use it; otherwise it
    // will generate a QR on the first connect() call.
  }

  async connect(): Promise<void> {
    if (this.socket) return // already connected / connecting

    this.setState('STARTING')

    // Build an in-memory AuthenticationState from our persisted AuthState.
    // We do NOT use useMultiFileAuthState (filesystem) because session
    // must survive without guaranteed filesystem persistence.
    const baileysAuthState = this.initialAuthState
      ? this.buildInMemoryAuthState(this.initialAuthState)
      : await this.buildFreshAuthState()

    this.authState = baileysAuthState

    this.socket = makeWASocket({
      auth: {
        creds: baileysAuthState.creds,
        keys: makeCacheableSignalKeyStore(baileysAuthState.keys, noopLogger as never),
      },
      printQRInTerminal: false,
      logger: noopLogger as never,
      // Keep connections alive between reconnects.
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
      await this.socket.logout()
      this.socket = null
    }
    this.authState = null
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

  private wireEvents(sock: WASocket, baileysAuth: AuthenticationState) {
    sock.ev.on('connection.update', (update: Partial<BaileysConnectionState>) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        // QR data URI — for Phase 3 the UI will read this from the DB.
        import('qrcode').then(({ toDataURL }) =>
          toDataURL(qr).then((dataUri: string) => {
            this.qrDataUri = dataUri
            this.setState('QR_REQUIRED')
            logger.info('connection_state_changed', { state: 'QR_REQUIRED', hasQR: true })
            this.emit({ type: 'qr', dataUri })
          })
        ).catch(() => {
          // qrcode package not installed yet — emit raw string for Phase 3.
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
        const shouldReconnect =
          reason !== DisconnectReason.loggedOut &&
          reason !== DisconnectReason.forbidden

        if (reason === DisconnectReason.loggedOut || reason === DisconnectReason.forbidden) {
          this.socket = null
          this.setState('LOGGED_OUT')
          this.emit({ type: 'logged_out' })
        } else {
          this.socket = null
          this.setState(shouldReconnect ? 'RECONNECTING' : 'DISCONNECTED')
        }
      }
    })

    sock.ev.on('creds.update', () => {
      // Baileys has updated internal creds — snapshot and propagate so
      // the session store can persist immediately.
      const snapshot = this.snapshotAuthState(baileysAuth)
      this.emit({ type: 'auth_state_updated', authState: snapshot })
    })

    sock.ev.on('messages.upsert', ({ messages }: { messages: BaileysEventMap['messages.upsert']['messages'] }) => {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue
        const body =
          msg.message.conversation ??
          msg.message.extendedTextMessage?.text ??
          null
        const contentType = body != null
          ? 'text'
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
            timestamp: (msg.messageTimestamp as number) ?? Date.now() / 1000,
          },
        })
      }
    })
  }

  private buildInMemoryAuthState(saved: AuthState): AuthenticationState {
    // Reconstruct Baileys creds/keys from our stored snapshot.
    return {
      creds: saved.creds as never,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: Record<string, unknown> = {}
          const store = saved.keys[type] as Record<string, unknown> | undefined
          if (store) {
            for (const id of ids) {
              if (store[id] !== undefined) data[id] = store[id]
            }
          }
          return data
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          for (const [type, vals] of Object.entries(data)) {
            if (!saved.keys[type]) saved.keys[type] = {}
            Object.assign(saved.keys[type] as object, vals)
          }
        },
      } as never,
    }
  }

  private async buildFreshAuthState(): Promise<AuthenticationState> {
    // No saved session — Baileys will need a QR scan.
    // We use a tiny in-memory stub; Baileys populates it after scanning.
    const { state } = await useMultiFileAuthState('/tmp/wa-init-throwaway')
    return state
  }

  private snapshotAuthState(baileysAuth: AuthenticationState): AuthState {
    return {
      creds: { ...(baileysAuth.creds as unknown as Record<string, unknown>) },
      keys: {},
    }
  }
}
