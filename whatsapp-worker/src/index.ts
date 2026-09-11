/**
 * WhatsApp Worker — entry point.
 *
 * Startup sequence:
 *  1. Validate config (fail fast on missing env vars)
 *  2. Create Supabase service-role client
 *  3. Create session store (DB-backed, encrypted)
 *  4. Create provider + connection manager
 *  5. Start heartbeat + outbox consumer
 *  6. Handle SIGTERM/SIGINT for graceful shutdown
 *
 * Normal restart (session exists):
 *   → loadSession → initProvider(existingAuth) → connect → CONNECTED (no QR)
 *
 * First run / session invalid:
 *   → loadSession → null → initProvider(null) → QR_REQUIRED
 *   → (CRM QR UI scans) → CONNECTED → session saved to DB
 */
import 'dotenv/config'

import { config } from './config.js'
import { logger } from './logger.js'
import { createServiceClient, WhatsAppRepository } from './repository/index.js'
import { DbSessionStore } from './session/db-store.js'
import { BaileysProvider } from './provider/baileys/index.js'
import { ConnectionManager } from './connection/manager.js'
import { InboxRepository } from './inbox/repository.js'
import { OutboxConsumer } from './outbox/consumer.js'
import { Heartbeat } from './health/heartbeat.js'

async function main() {
  logger.info('worker_started', {
    workerId: config.worker.id,
    accountId: config.worker.accountId,
    node: process.version,
  })

  const supabase = createServiceClient()
  const repo = new WhatsAppRepository(supabase)
  const sessionStore = new DbSessionStore(supabase, config.session.encryptionKey)
  const inboxRepo = new InboxRepository(
    supabase,
    config.dispatch.baseUrl,
    config.dispatch.secret,
  )

  // Fetch account_id for the whatsapp_accounts row so InboxRepository
  // can scope contacts/conversations correctly.
  const accountId = await repo.getAccountId(config.worker.accountId)
  if (!accountId) {
    throw new Error(
      `whatsapp_accounts row not found for id=${config.worker.accountId}. ` +
      'Create the row via the CRM WhatsApp connect screen first.'
    )
  }

  const provider = new BaileysProvider()
  const connectionManager = new ConnectionManager({
    provider,
    sessionStore,
    repo,
    inboxRepo,
    whatsappAccountId: config.worker.accountId,
    accountId,
    workerId: config.worker.id,
  })

  const heartbeat = new Heartbeat(
    repo,
    connectionManager,
    config.worker.accountId,
    config.worker.id,
    config.heartbeat.intervalMs,
  )

  const outboxConsumer = new OutboxConsumer(
    provider,
    repo,
    config.worker.accountId,
    config.worker.id,
    config.outbox.pollIntervalMs,
  )

  heartbeat.start()
  outboxConsumer.start()

  await connectionManager.start()

  async function shutdown(signal: string) {
    logger.info('worker_stopped', { signal })
    outboxConsumer.stop()
    heartbeat.stop()
    await connectionManager.stop()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
  process.on('uncaughtException', (err) => {
    logger.error('error', { op: 'uncaughtException', message: String(err) })
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('error', { op: 'unhandledRejection', message: String(reason) })
    process.exit(1)
  })
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    event: 'error',
    message: String(err),
  }) + '\n')
  process.exit(1)
})
