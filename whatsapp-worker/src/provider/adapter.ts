import type { ConnectionState } from '../connection/states.js'

/**
 * Provider-agnostic WhatsApp adapter interface.
 * The CRM and worker depend on this — not on Baileys directly.
 * Swap implementations by changing the concrete class passed to ConnectionManager.
 */
export interface WhatsAppProvider {
  /** One-time setup. Call before connect(). */
  initialize(authState: AuthState | null): Promise<void>

  /** Start the WhatsApp connection. Triggers QR emission if no valid session. */
  connect(): Promise<void>

  /** Gracefully close the connection. Does NOT invalidate the session. */
  disconnect(): Promise<void>

  /** Hard logout — invalidates the WhatsApp session, clears auth state. */
  logout(): Promise<void>

  getConnectionState(): ConnectionState

  /** Returns the current QR code as a data URI, or null if not in QR state. */
  getQRCode(): string | null

  sendText(jid: string, text: string): Promise<SendResult>
  sendMedia(jid: string, media: MediaPayload): Promise<SendResult>
  markRead(jid: string, messageIds: string[]): Promise<void>

  /** Emits events to the registered handler. */
  onEvent(handler: ProviderEventHandler): void
}

// ── Shared types ─────────────────────────────────────────────────────────────

export interface AuthState {
  /** Opaque JSON-serialisable object. Baileys uses its own shape internally. */
  creds: Record<string, unknown>
  keys: Record<string, unknown>
}

export interface SendResult {
  messageId: string
  status: 'sent' | 'failed'
  error?: string
}

export interface MediaPayload {
  type: 'image' | 'document' | 'audio' | 'video'
  url?: string
  buffer?: Buffer
  mimetype: string
  caption?: string
  filename?: string
}

export type ProviderEventHandler = (event: ProviderEvent) => void | Promise<void>

export type ProviderEvent =
  | { type: 'state_changed'; state: ConnectionState }
  | { type: 'qr'; dataUri: string }
  | { type: 'auth_state_updated'; authState: AuthState }
  | { type: 'message_received'; message: InboundMessage }
  | { type: 'message_status'; messageId: string; status: 'delivered' | 'read' | 'failed' }
  | { type: 'logged_out' }

export interface InboundMessage {
  messageId: string
  from: string       // JID e.g. 919876543210@s.whatsapp.net
  body: string | null
  contentType: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'unknown'
  mediaUrl?: string
  timestamp: number
}
