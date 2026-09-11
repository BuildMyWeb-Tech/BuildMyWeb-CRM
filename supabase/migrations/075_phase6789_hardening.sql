-- Phase 6-9: Automation integration, hardening, indexes, RPCs

-- ────────────────────────────────────────────────────────────────────────────
-- increment_conversation_unread
-- Called by the QR worker after inserting an inbound customer message.
-- The webhook (Meta path) uses bump_conversation_on_inbound instead.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_conversation_unread(conversation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE conversations
     SET unread_count = COALESCE(unread_count, 0) + 1,
         updated_at   = now()
   WHERE id = conversation_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- recover_stale_outbox_jobs
-- Returns stuck 'processing' jobs whose lock is older than the TTL back to
-- 'pending' so any healthy worker can retry them.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recover_stale_outbox_jobs(stale_minutes INTEGER DEFAULT 5)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  recovered INTEGER;
BEGIN
  UPDATE whatsapp_message_outbox
     SET status     = 'pending',
         locked_at  = NULL,
         locked_by  = NULL,
         updated_at = now()
   WHERE status = 'processing'
     AND locked_at < now() - (stale_minutes || ' minutes')::INTERVAL
     AND attempts < max_attempts;

  GET DIAGNOSTICS recovered = ROW_COUNT;
  RETURN recovered;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Indexes — only where they help real query paths
-- ────────────────────────────────────────────────────────────────────────────

-- Fast status update by wamid (used by QR worker + webhook status handler)
CREATE INDEX IF NOT EXISTS idx_messages_message_id
  ON messages (message_id)
  WHERE message_id IS NOT NULL;

-- Fast outbox lookup by account + status + scheduled_at (worker poll query)
CREATE INDEX IF NOT EXISTS idx_outbox_pending_scheduled
  ON whatsapp_message_outbox (whatsapp_account_id, scheduled_at)
  WHERE status = 'pending';

-- Fast stale-lock recovery sweep
CREATE INDEX IF NOT EXISTS idx_outbox_processing_locked_at
  ON whatsapp_message_outbox (locked_at)
  WHERE status = 'processing';

-- whatsapp_accounts fast lookup by account
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_account_id
  ON whatsapp_accounts (account_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Unique idempotency key on outbox (prevents duplicate inserts on retry)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE whatsapp_message_outbox
  ADD CONSTRAINT whatsapp_message_outbox_idempotency_key_unique
  UNIQUE (idempotency_key)
  DEFERRABLE INITIALLY IMMEDIATE;

-- The unique index on (conversation_id, message_id) for inbound dedup is
-- already in migration 037. No-op guard for safety.
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conv_msg_id ON messages (conversation_id, message_id);
