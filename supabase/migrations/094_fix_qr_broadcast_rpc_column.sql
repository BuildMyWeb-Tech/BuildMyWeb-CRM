-- ============================================================
-- Migration 094: Fix create_qr_broadcast_with_recipients RPC
--
-- Migration 092 accidentally used `created_by` in the broadcasts
-- INSERT. The actual column is `user_id`. This migration replaces
-- the function with the corrected version.
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_qr_broadcast_with_recipients(
  p_account_id          UUID,
  p_user_id             UUID,
  p_name                TEXT,
  p_whatsapp_account_id UUID,
  p_message_text        TEXT,
  p_contact_ids         UUID[],
  p_scheduled_at        TIMESTAMPTZ DEFAULT NULL,
  p_send_interval_ms    INTEGER     DEFAULT 1000,
  p_media_url           TEXT        DEFAULT NULL,
  p_media_type          TEXT        DEFAULT NULL,
  p_media_filename      TEXT        DEFAULT NULL,
  p_media_mimetype      TEXT        DEFAULT NULL
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
  v_scheduled_at := COALESCE(p_scheduled_at, now());

  v_status := CASE
    WHEN p_scheduled_at IS NOT NULL AND p_scheduled_at > (now() + INTERVAL '30 seconds')
    THEN 'scheduled'
    ELSE 'sending'
  END;

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

  FOR v_contact_id IN
    SELECT DISTINCT unnest(p_contact_ids)
  LOOP
    SELECT phone INTO v_phone
    FROM contacts
    WHERE id = v_contact_id
      AND account_id = p_account_id;

    CONTINUE WHEN v_phone IS NULL OR trim(v_phone) = '';

    INSERT INTO broadcast_recipients (
      broadcast_id,
      contact_id,
      phone_number,
      status
    ) VALUES (
      v_broadcast_id,
      v_contact_id,
      trim(v_phone),
      'pending'
    )
    RETURNING id INTO v_recipient_id;

    v_idempotency_key := 'broadcast:' || v_broadcast_id || ':recipient:' || v_recipient_id;

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
      trim(v_phone),
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

  UPDATE broadcasts
  SET total_recipients = v_count,
      updated_at       = now()
  WHERE id = v_broadcast_id;

  RETURN QUERY SELECT v_broadcast_id, v_count;
END;
$$;

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
