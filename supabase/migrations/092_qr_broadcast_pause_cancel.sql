-- ============================================================
-- Migration 092: QR broadcast pause/cancel/scheduled states
--
-- Extends the broadcasts.status CHECK constraint to allow:
--   paused    — user paused; worker will not start new jobs
--   cancelled — permanently stopped; pending jobs will not send
--
-- The existing 'scheduled' value was already in the CHECK from
-- migration 001 — included here for documentation clarity.
--
-- Also adds qr_broadcast_id index to whatsapp_message_outbox
-- for efficient "all pending jobs for broadcast X" lookups.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Postgres does not support ALTER TABLE ... ALTER CONSTRAINT
-- (you cannot just extend a CHECK). The safest idempotent path
-- is DROP then re-add with the broadened value set.

-- Step 1: remove the existing CHECK constraint by name.
-- If the name differs from the default Postgres convention
-- (table_column_check) the DROP silently fails because of IF EXISTS,
-- and the ADD below still succeeds if the value is already accepted.
DO $$
BEGIN
  ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
  ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check1;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Step 2: add the broadened CHECK.
ALTER TABLE broadcasts
  DROP CONSTRAINT IF EXISTS broadcasts_status_check_v2;

ALTER TABLE broadcasts
  ADD CONSTRAINT broadcasts_status_check_v2
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'paused', 'cancelled'));

-- Index for the worker's "find pending jobs for this broadcast"
-- lookup (also added in 091, re-stated here as idempotent guard).
CREATE INDEX IF NOT EXISTS idx_outbox_broadcast_status
  ON whatsapp_message_outbox(broadcast_id, status)
  WHERE broadcast_id IS NOT NULL;

-- Efficient lookup: "all outbox jobs for this broadcast regardless of status"
-- (used by pause/cancel to update pending jobs).
CREATE INDEX IF NOT EXISTS idx_outbox_broadcast_id
  ON whatsapp_message_outbox(broadcast_id)
  WHERE broadcast_id IS NOT NULL;

-- ============================================================
-- Phase G: fix create_qr_broadcast_with_recipients to set
-- status='scheduled' when scheduled_at is in the future.
--
-- The original RPC in migration 091 always inserted 'sending'.
-- Replace the function with one that uses CASE on scheduled_at.
-- ============================================================

CREATE OR REPLACE FUNCTION create_qr_broadcast_with_recipients(
  p_account_id        UUID,
  p_user_id           UUID,
  p_name              TEXT,
  p_whatsapp_account_id UUID,
  p_message_text      TEXT,
  p_contact_ids       UUID[],
  p_scheduled_at      TIMESTAMPTZ DEFAULT NULL,
  p_send_interval_ms  INTEGER     DEFAULT 1000,
  p_media_url         TEXT        DEFAULT NULL,
  p_media_type        TEXT        DEFAULT NULL,
  p_media_filename    TEXT        DEFAULT NULL,
  p_media_mimetype    TEXT        DEFAULT NULL
)
RETURNS TABLE(broadcast_id UUID, recipient_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broadcast_id    UUID;
  v_recipient_id    UUID;
  v_phone           TEXT;
  v_idempotency_key TEXT;
  v_count           INTEGER := 0;
  v_scheduled_at    TIMESTAMPTZ;
  v_contact_id      UUID;
  v_status          TEXT;
BEGIN
  -- Resolve scheduled_at: NULL means send immediately.
  v_scheduled_at := COALESCE(p_scheduled_at, now());

  -- Determine initial broadcast status.
  -- Phase G: use 'scheduled' when the send time is meaningfully in the future
  -- (more than 30 seconds), so the worker does not attempt to pick it up yet.
  v_status := CASE
    WHEN p_scheduled_at IS NOT NULL AND p_scheduled_at > (now() + INTERVAL '30 seconds')
    THEN 'scheduled'
    ELSE 'sending'
  END;

  -- Insert the broadcast header row.
  INSERT INTO broadcasts (
    account_id,
    created_by,
    name,
    provider,
    whatsapp_account_id,
    message_text,
    media_url,
    media_type,
    media_filename,
    media_mimetype,
    send_interval_ms,
    status,
    total_recipients,
    -- Meta-only columns left NULL for QR broadcasts.
    template_name,
    template_language
  ) VALUES (
    p_account_id,
    p_user_id,
    p_name,
    'qr',
    p_whatsapp_account_id,
    p_message_text,
    p_media_url,
    p_media_type,
    p_media_filename,
    p_media_mimetype,
    p_send_interval_ms,
    v_status,
    0,
    NULL,
    NULL
  )
  RETURNING id INTO v_broadcast_id;

  -- De-duplicate contact IDs before iterating.
  FOR v_contact_id IN
    SELECT DISTINCT unnest(p_contact_ids)
  LOOP
    -- Snapshot the phone number at broadcast-creation time.
    SELECT phone INTO v_phone
    FROM contacts
    WHERE id = v_contact_id
      AND account_id = p_account_id;

    -- Skip contacts with no phone or from a different account.
    CONTINUE WHEN v_phone IS NULL;

    INSERT INTO broadcast_recipients (
      broadcast_id,
      contact_id,
      phone_number,
      status
    )
    VALUES (
      v_broadcast_id,
      v_contact_id,
      v_phone,
      'pending'
    )
    RETURNING id INTO v_recipient_id;

    v_idempotency_key := 'broadcast:' || v_broadcast_id || ':recipient:' || v_recipient_id;

    -- Outbox job: one per recipient, scheduled together.
    INSERT INTO whatsapp_message_outbox (
      account_id,
      whatsapp_account_id,
      recipient,
      message_type,
      payload,
      broadcast_id,
      broadcast_recipient_id,
      scheduled_at,
      idempotency_key
    ) VALUES (
      p_account_id,
      p_whatsapp_account_id,
      v_phone,
      CASE WHEN p_media_type IS NOT NULL THEN p_media_type ELSE 'text' END,
      CASE
        WHEN p_media_type IS NOT NULL THEN
          jsonb_build_object(
            'url',      p_media_url,
            'mimetype', p_media_mimetype,
            'filename', p_media_filename,
            'caption',  p_message_text
          )
        ELSE
          jsonb_build_object('text', p_message_text)
      END,
      v_broadcast_id,
      v_recipient_id,
      v_scheduled_at,
      v_idempotency_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  -- Update aggregate counter with the real recipient count.
  UPDATE broadcasts
  SET total_recipients = v_count,
      updated_at       = now()
  WHERE id = v_broadcast_id;

  RETURN QUERY SELECT v_broadcast_id, v_count;
END;
$$;
