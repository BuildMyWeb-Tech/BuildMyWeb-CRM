const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const
type Level = keyof typeof LEVELS

function configLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info') as Level
  return LEVELS[raw] ?? 1
}

export type LogEvent =
  | 'worker_started'
  | 'worker_stopped'
  | 'connection_starting'
  | 'connection_state_changed'
  | 'session_loaded'
  | 'session_saved'
  | 'session_cleared'
  | 'session_not_found'
  | 'reconnect_attempt'
  | 'reconnect_backoff'
  | 'outbox_job_claimed'
  | 'outbox_job_completed'
  | 'outbox_job_failed'
  | 'heartbeat'
  | 'lock_acquired'
  | 'lock_released'
  | 'error'
  | 'inbound_upsert_received'
  | 'inbound_message_raw'
  | 'inbound_message_skipped'
  | 'inbound_message_dispatching'
  | 'inbound_message_received'
  | 'inbound_contact_found'
  | 'inbound_contact_created'
  | 'inbound_contact_not_resolved'
  | 'inbound_contact_resolved'
  | 'inbound_conversation_found'
  | 'inbound_conversation_created'
  | 'inbound_conversation_not_resolved'
  | 'inbound_conversation_resolved'
  | 'inbound_message_saved'
  | 'inbound_message_inserted'
  | 'inbound_owner_not_found'
  | 'inbound_lid_resolved'
  | 'inbound_lid_unresolvable'
  | 'signal_keys_updated'
  | 'signal_keys_persisted'
  | 'creds_update_persisted'
  | 'session_save_queued'

function log(level: Level, event: LogEvent, data?: Record<string, unknown>) {
  if (LEVELS[level] < configLevel()) return
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    workerId: process.env.WHATSAPP_WORKER_ID,
    ...data,
  })
  if (level === 'error' || level === 'warn') {
    process.stderr.write(entry + '\n')
  } else {
    process.stdout.write(entry + '\n')
  }
}

export const logger = {
  debug: (event: LogEvent, data?: Record<string, unknown>) => log('debug', event, data),
  info:  (event: LogEvent, data?: Record<string, unknown>) => log('info',  event, data),
  warn:  (event: LogEvent, data?: Record<string, unknown>) => log('warn',  event, data),
  error: (event: LogEvent, data?: Record<string, unknown>) => log('error', event, data),
}
