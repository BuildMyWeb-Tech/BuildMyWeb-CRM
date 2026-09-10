export type ConnectionState =
  | 'DISCONNECTED'
  | 'STARTING'
  | 'AUTHENTICATING'
  | 'QR_REQUIRED'
  | 'PAIRING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'LOGGED_OUT'
  | 'ERROR'

/** States that warrant automatic reconnect attempts. */
export const RECONNECTABLE_STATES: ReadonlySet<ConnectionState> = new Set([
  'DISCONNECTED',
  'RECONNECTING',
  'ERROR',
])

/** States that mean the session is definitively gone — require fresh QR. */
export const SESSION_INVALID_STATES: ReadonlySet<ConnectionState> = new Set([
  'LOGGED_OUT',
  'QR_REQUIRED',
])

/** Exponential backoff delays in ms, capped at 60 s. */
export const BACKOFF_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000]

export function backoffDelay(attempt: number): number {
  const idx = Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)
  return BACKOFF_DELAYS_MS[idx]
}
