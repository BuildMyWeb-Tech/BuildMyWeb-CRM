/**
 * WhatsAppRepository — all Supabase access for the worker.
 * No other file should call supabase directly; this keeps the data
 * access layer in one place and makes testing straightforward.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ConnectionState } from '../connection/states.js'
import type { OutboxJob } from '../outbox/types.js'
import { config } from '../config.js'

export function createServiceClient(): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  })
}

export class WhatsAppRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── Connection state / heartbeat ─────────────────────────────────────────

  async claimLock(whatsappAccountId: string, workerId: string): Promise<boolean> {
    // Claim the row for this worker instance if no other worker holds it,
    // OR if the previous heartbeat is stale (> 2 min = dead worker).
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const { data, error } = await this.supabase
      .from('whatsapp_accounts')
      .update({
        worker_instance_id: workerId,
        worker_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', whatsappAccountId)
      .or(`worker_instance_id.is.null,last_heartbeat_at.lt.${staleThreshold},worker_instance_id.eq.${workerId}`)
      .select('id')
      .maybeSingle()

    if (error) return false
    return !!data
  }

  async releaseLock(whatsappAccountId: string, workerId: string): Promise<void> {
    await this.supabase
      .from('whatsapp_accounts')
      .update({ worker_instance_id: null, updated_at: new Date().toISOString() })
      .eq('id', whatsappAccountId)
      .eq('worker_instance_id', workerId)
  }

  async heartbeat(whatsappAccountId: string, workerId: string): Promise<void> {
    await this.supabase
      .from('whatsapp_accounts')
      .update({
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', whatsappAccountId)
      .eq('worker_instance_id', workerId)
  }

  async setConnectionState(
    whatsappAccountId: string,
    state: ConnectionState,
    extra?: {
      qrDataUri?: string | null
      qrGeneratedAt?: string | null
      lastError?: string | null
      reconnectAttempts?: number
    },
  ): Promise<void> {
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      connection_state: state,
      status: state === 'CONNECTED' ? 'connected' : state === 'ERROR' ? 'error' : 'disconnected',
      updated_at: now,
    }
    if (state === 'CONNECTED') patch.last_connected_at = now
    if (state === 'DISCONNECTED' || state === 'LOGGED_OUT') patch.last_disconnected_at = now
    if (extra?.qrDataUri !== undefined) patch.qr_data_uri = extra.qrDataUri
    if (extra?.qrGeneratedAt !== undefined) patch.qr_generated_at = extra.qrGeneratedAt
    if (extra?.lastError !== undefined) patch.last_error = extra.lastError
    if (extra?.reconnectAttempts !== undefined) patch.reconnect_attempts = extra.reconnectAttempts

    await this.supabase
      .from('whatsapp_accounts')
      .update(patch)
      .eq('id', whatsappAccountId)
  }

  async getAccountId(whatsappAccountId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('whatsapp_accounts')
      .select('account_id')
      .eq('id', whatsappAccountId)
      .maybeSingle()
    return data?.account_id ?? null
  }

  // ── Outbox ───────────────────────────────────────────────────────────────

  async claimOutboxJobs(
    whatsappAccountId: string,
    workerId: string,
    batchSize = 5,
  ): Promise<OutboxJob[]> {
    // Postgres: SELECT ... FOR UPDATE SKIP LOCKED via Supabase RPC.
    // We fall back to a manual two-step claim if RPC not available.
    const now = new Date().toISOString()
    const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    // Find claimable job ids.
    const { data: candidates } = await this.supabase
      .from('whatsapp_message_outbox')
      .select('id')
      .eq('whatsapp_account_id', whatsappAccountId)
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .or(`locked_at.is.null,locked_at.lt.${stale}`)
      .order('scheduled_at', { ascending: true })
      .limit(batchSize)

    if (!candidates || candidates.length === 0) return []

    const ids = candidates.map((r) => r.id)

    // Claim them — only rows that are still pending/stale will match.
    const { data: claimed } = await this.supabase
      .from('whatsapp_message_outbox')
      .update({
        status: 'processing',
        locked_at: now,
        locked_by: workerId,
        updated_at: now,
      })
      .in('id', ids)
      .eq('status', 'pending')
      .select('*')

    // Increment attempts via separate update (Supabase JS doesn't support
    // column expressions in update). Best-effort — if the RPC doesn't
    // exist yet the attempt count stays at the value from the claim UPDATE.
    if (claimed && claimed.length > 0) {
      this.supabase.rpc('increment_outbox_attempts', {
        job_ids: claimed.map((r: OutboxJob) => r.id),
      }).then(() => {}, () => {})
    }

    return (claimed ?? []) as OutboxJob[]
  }

  async markOutboxSent(jobId: string): Promise<void> {
    await this.supabase
      .from('whatsapp_message_outbox')
      .update({
        status: 'sent',
        processed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  }

  async markOutboxFailed(jobId: string, error: string, cancel: boolean): Promise<void> {
    await this.supabase
      .from('whatsapp_message_outbox')
      .update({
        status: cancel ? 'failed' : 'pending',
        error,
        processed_at: cancel ? new Date().toISOString() : null,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  }
}
