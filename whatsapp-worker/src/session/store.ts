import type { AuthState } from '../provider/adapter.js'

/**
 * WhatsAppSessionStore — provider-agnostic interface for persisting
 * Baileys authentication state. The DB-backed implementation is the
 * default; a filesystem implementation can be swapped in by changing
 * the concrete class injected into ConnectionManager.
 */
export interface WhatsAppSessionStore {
  /** Load the auth state for an account. Returns null if no session exists. */
  load(whatsappAccountId: string): Promise<AuthState | null>

  /** Persist the auth state. Overwrites any existing state. */
  save(whatsappAccountId: string, authState: AuthState): Promise<void>

  /** Delete the auth state (e.g. on logout). */
  clear(whatsappAccountId: string): Promise<void>
}
