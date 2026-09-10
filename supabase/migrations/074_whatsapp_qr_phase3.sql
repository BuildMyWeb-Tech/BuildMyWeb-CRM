-- Phase 3: disconnect command + outbox attempts increment RPC
-- depends on: 073_whatsapp_qr_foundation.sql

-- Allow the CRM to request a graceful disconnect.
-- The worker checks this on each heartbeat and calls provider.logout().
ALTER TABLE whatsapp_accounts
  ADD COLUMN IF NOT EXISTS disconnect_requested_at TIMESTAMPTZ;

-- Increment outbox job attempt counter atomically.
-- Called fire-and-forget by the worker after claiming a batch.
CREATE OR REPLACE FUNCTION increment_outbox_attempts(job_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE whatsapp_message_outbox
     SET attempts   = attempts + 1,
         updated_at = now()
   WHERE id = ANY(job_ids);
END;
$$;

-- Partial index: pending jobs that are not stale-locked.
-- Speeds up claimOutboxJobs query.
CREATE INDEX IF NOT EXISTS idx_outbox_claimable
  ON whatsapp_message_outbox (whatsapp_account_id, scheduled_at)
  WHERE status = 'pending';

-- Index on whatsapp_accounts for disconnect_requested lookup.
CREATE INDEX IF NOT EXISTS idx_wa_accounts_disconnect
  ON whatsapp_accounts (id)
  WHERE disconnect_requested_at IS NOT NULL;
