function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

// Lazy getter — evaluated on first access, not at module import time.
// This lets tests set process.env before the config is read.
let _config: ReturnType<typeof buildConfig> | null = null

function buildConfig() {
  return {
    supabase: {
      url: required('SUPABASE_URL'),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    },
    worker: {
      id: required('WHATSAPP_WORKER_ID'),
      accountId: required('WHATSAPP_ACCOUNT_ID'),
    },
    session: {
      encryptionKey: required('WHATSAPP_SESSION_ENCRYPTION_KEY'),
    },
    outbox: {
      pollIntervalMs: parseInt(optional('OUTBOX_POLL_INTERVAL_MS', '2000'), 10),
    },
    heartbeat: {
      intervalMs: parseInt(optional('HEARTBEAT_INTERVAL_MS', '30000'), 10),
    },
    log: {
      level: optional('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
    },
  } as const
}

export function getConfig() {
  if (!_config) _config = buildConfig()
  return _config
}

// Named export used by entry point and non-test code.
// In tests, call getConfig() after setting process.env.
export const config = new Proxy({} as ReturnType<typeof buildConfig>, {
  get(_target, prop) {
    return getConfig()[prop as keyof ReturnType<typeof buildConfig>]
  },
})
