-- ============================================================
-- Migration 093: QR broadcast delivery tracking
--
-- 1. broadcast_recipients: add 'cancelled' status, updated_at,
--    sent_at (snapshot when the outbox job was accepted by WhatsApp)
-- 2. whatsapp_message_outbox: add sent_message_id (wamid stored
--    after Baileys accepts the message) to enable delivery/read
--    receipt mapping back to broadcast_recipients
-- 3. Update _bcast_cols_for_status so 'cancelled' contributes
--    to nothing (not counted as failed or sent)
-- 4. Index for fast wamid → outbox lookup during receipt events
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ── broadcast_recipients ────────────────────────────────────────────────────

-- Extend the status CHECK to allow 'cancelled'
-- (pending outbox jobs are cancelled by the cancel API; the worker
-- skips them and can then flip the recipient to 'cancelled').
DO $$
BEGIN
  ALTER TABLE broadcast_recipients DROP CONSTRAINT IF EXISTS broadcast_recipients_status_check;
  ALTER TABLE broadcast_recipients DROP CONSTRAINT IF EXISTS broadcast_recipients_status_check1;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

ALTER TABLE broadcast_recipients
  DROP CONSTRAINT IF EXISTS broadcast_recipients_status_v2;

ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_status_v2
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed', 'cancelled'));

-- Timestamp column for row freshness (used by the incremental aggregate trigger
-- and display in the recipient table).
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Snapshot when the WhatsApp provider accepted the message.
-- Distinct from delivered_at (WhatsApp → recipient device).
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- ── whatsapp_message_outbox ─────────────────────────────────────────────────

-- Store the wamid (WhatsApp Message ID) returned by Baileys after a successful
-- send, so that delivery/read receipt events (which carry only the wamid) can
-- be mapped back to the broadcast_recipient_id.
ALTER TABLE whatsapp_message_outbox
  ADD COLUMN IF NOT EXISTS sent_message_id TEXT;

-- Fast wamid lookup for delivery/read receipt events.
CREATE INDEX IF NOT EXISTS idx_outbox_sent_message_id
  ON whatsapp_message_outbox (sent_message_id)
  WHERE sent_message_id IS NOT NULL;

-- ── Update aggregate trigger helper ─────────────────────────────────────────
-- 'cancelled' recipients contribute to no counter (neither failed nor sent).
-- This replaces the function from migration 005 — same file/function name.

CREATE OR REPLACE FUNCTION public._bcast_cols_for_status(s TEXT)
RETURNS TEXT[] AS $$
BEGIN
  IF s = 'pending'   THEN RETURN ARRAY[]::TEXT[]; END IF;
  IF s = 'cancelled' THEN RETURN ARRAY[]::TEXT[]; END IF;
  IF s = 'sent'      THEN RETURN ARRAY['sent_count']; END IF;
  IF s = 'delivered' THEN RETURN ARRAY['sent_count','delivered_count']; END IF;
  IF s = 'read'      THEN RETURN ARRAY['sent_count','delivered_count','read_count']; END IF;
  IF s = 'replied'   THEN RETURN ARRAY['sent_count','delivered_count','read_count','replied_count']; END IF;
  IF s = 'failed'    THEN RETURN ARRAY['failed_count']; END IF;
  RETURN ARRAY[]::TEXT[];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Also update recompute_broadcast_counts to exclude cancelled.
CREATE OR REPLACE FUNCTION public.recompute_broadcast_counts(bid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE broadcasts b SET
    sent_count      = agg.sent_count,
    delivered_count = agg.delivered_count,
    read_count      = agg.read_count,
    replied_count   = agg.replied_count,
    failed_count    = agg.failed_count,
    updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('sent','delivered','read','replied'))    AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('delivered','read','replied'))           AS delivered_count,
      COUNT(*) FILTER (WHERE status IN ('read','replied'))                       AS read_count,
      COUNT(*) FILTER (WHERE status = 'replied')                                 AS replied_count,
      COUNT(*) FILTER (WHERE status = 'failed')                                  AS failed_count
    FROM broadcast_recipients
    WHERE broadcast_id = bid
  ) agg
  WHERE b.id = bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
