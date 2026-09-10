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
