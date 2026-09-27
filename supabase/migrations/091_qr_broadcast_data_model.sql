-- ============================================================
-- Migration 091: QR broadcast data model
--
-- Adds first-class QR broadcast support to the broadcasts +
-- broadcast_recipients + whatsapp_message_outbox tables, and
-- creates an atomic RPC for QR broadcast creation.
--
-- Existing Meta broadcast path is untouched.
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- broadcasts: QR-specific columns
-- ============================================================

-- Which provider created this broadcast (default 'meta' preserves
-- all existing rows without a migration data-fix).
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta'
    CHECK (provider IN ('meta', 'qr'));

-- QR broadcasts are tied to a specific connected WhatsApp account.
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS whatsapp_account_id UUID
    REFERENCES whatsapp_accounts(id) ON DELETE SET NULL;

-- Free-form message text (QR sends raw text; Meta uses templates).
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS message_text TEXT;

-- Optional media attachment.
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS media_url TEXT;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS media_type TEXT
    CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'document', 'audio'));

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS media_filename TEXT;

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS media_mimetype TEXT;

-- Responsible send pacing: milliseconds between jobs.
-- Default 1000ms (1 msg/sec). Caller may increase.
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS send_interval_ms INTEGER NOT NULL DEFAULT 1000;

CREATE INDEX IF NOT EXISTS idx_broadcasts_whatsapp_account
  ON broadcasts(whatsapp_account_id)
  WHERE whatsapp_account_id IS NOT NULL;

-- ============================================================
-- broadcast_recipients: QR-specific columns
-- ============================================================

-- Snapshot of the contact's phone at broadcast creation time.
-- Decouples the broadcast from future contact edits.
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Retry tracking (QR path; Meta uses webhook status).
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- ============================================================
-- whatsapp_message_outbox: broadcast linkage columns
-- ============================================================

-- Link an outbox job back to its broadcast.
ALTER TABLE whatsapp_message_outbox
  ADD COLUMN IF NOT EXISTS broadcast_id UUID
    REFERENCES broadcasts(id) ON DELETE SET NULL;

-- Link an outbox job to its specific recipient row so the worker
-- can advance broadcast_recipients.status and drive aggregate counts.
ALTER TABLE whatsapp_message_outbox
  ADD COLUMN IF NOT EXISTS broadcast_recipient_id UUID
    REFERENCES broadcast_recipients(id) ON DELETE SET NULL;

-- Composite index for worker "find all pending jobs for broadcast X".
CREATE INDEX IF NOT EXISTS idx_outbox_broadcast_status
  ON whatsapp_message_outbox(broadcast_id, status)
  WHERE broadcast_id IS NOT NULL;

-- ============================================================
-- create_qr_broadcast_with_recipients
--
-- Atomic single-transaction RPC for QR broadcast creation.
--
--   1. Deduplicates the caller-supplied contact_ids.
--   2. Inserts the broadcasts row (provider = 'qr').
--   3. For each unique contact that has a non-empty phone,
--      inserts a broadcast_recipients row (phone snapshotted).
--   4. Inserts a whatsapp_message_outbox row per recipient with
--      a DETERMINISTIC idempotency key:
--        broadcast:<broadcast_id>:recipient:<recipient_id>
--   5. Updates total_recipients to the real count (contacts
--      missing phones are silently skipped).
--   6. Returns (broadcast_id, recipient_count).
--
-- Security: SECURITY DEFINER so the anon/authenticated user can
-- call it without needing direct INSERT rights on all tables.
-- The caller must be an account member (enforced by the caller's
-- RLS-checked Supabase client; the function trusts p_account_id).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_qr_broadcast_with_recipients(
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
BEGIN
  -- Resolve scheduled_at: NULL means send immediately.
  v_scheduled_at := COALESCE(p_scheduled_at, now());

  -- Insert the broadcast header row.
  INSERT INTO broadcasts (
    account_id,
    user_id,
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
  )
  VALUES (
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
    'sending',
    0,   -- updated below once we know the real count
    NULL,
    NULL
  )
  RETURNING id INTO v_broadcast_id;

  -- Iterate over deduplicated contact IDs.
  FOR v_contact_id IN
    SELECT DISTINCT unnest(p_contact_ids)
  LOOP
    -- Snapshot phone at creation time.
    SELECT phone INTO v_phone
    FROM contacts
    WHERE id = v_contact_id
      AND account_id = p_account_id  -- safety: only own contacts
    LIMIT 1;

    -- Skip contacts without a valid phone number.
    IF v_phone IS NULL OR trim(v_phone) = '' THEN
      CONTINUE;
    END IF;

    -- Insert recipient row.
    INSERT INTO broadcast_recipients (
      broadcast_id,
      contact_id,
      phone_number,
      status
    )
    VALUES (
      v_broadcast_id,
      v_contact_id,
      trim(v_phone),
      'pending'
    )
    RETURNING id INTO v_recipient_id;

    -- Deterministic idempotency key — safe to retry without duplicates.
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
    )
    VALUES (
      p_account_id,
      p_whatsapp_account_id,
      trim(v_phone),
      CASE WHEN p_media_url IS NOT NULL THEN p_media_type ELSE 'text' END,
      jsonb_build_object(
        'text',          p_message_text,
        'mediaUrl',      p_media_url,
        'mediaType',     p_media_type,
        'mediaFilename', p_media_filename,
        'mediaMimetype', p_media_mimetype
      ),
      v_broadcast_id,
      v_recipient_id,
      v_scheduled_at,
      v_idempotency_key
    );

    v_count := v_count + 1;
  END LOOP;

  -- Update the real recipient count on the broadcast row.
  UPDATE broadcasts
  SET total_recipients = v_count
  WHERE id = v_broadcast_id;

  RETURN QUERY SELECT v_broadcast_id, v_count;
END;
$$;

-- Only service-role and the CRM API (which runs as service-role) can
-- call this. Revoke from normal roles so a direct PostgREST call from
-- an authenticated user (without going through the API route) is blocked.
REVOKE ALL ON FUNCTION public.create_qr_broadcast_with_recipients(
  UUID, UUID, TEXT, UUID, TEXT, UUID[],
  TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_qr_broadcast_with_recipients(
  UUID, UUID, TEXT, UUID, TEXT, UUID[],
  TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.create_qr_broadcast_with_recipients(
  UUID, UUID, TEXT, UUID, TEXT, UUID[],
  TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_qr_broadcast_with_recipients(
  UUID, UUID, TEXT, UUID, TEXT, UUID[],
  TIMESTAMPTZ, INTEGER, TEXT, TEXT, TEXT, TEXT
) TO service_role;
