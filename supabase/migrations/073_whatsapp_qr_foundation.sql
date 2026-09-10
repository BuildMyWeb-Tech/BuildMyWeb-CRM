-- Migration 073: WhatsApp QR/Linked-Device foundation
-- ■ whatsapp_accounts      — one row per paired WA number per account
-- ■ whatsapp_session_state — encrypted Baileys auth state (service-role only)
-- ■ whatsapp_message_outbox — worker-consumed send queue
-- ■ whatsapp_config.provider — distinguish qr vs meta without breaking existing rows

-- ── whatsapp_config: add provider column ─────────────────────────────────────

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta'
    CHECK (provider IN ('meta', 'qr'));

-- ── whatsapp_accounts ────────────────────────────────────────────────────────
-- One row per WhatsApp number connected to an account.
-- CRM reads this for UI status; worker owns writes via service-role.

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phone_number          TEXT,
  display_name          TEXT,
  -- 'qr' = Baileys/linked-device. 'meta' = Meta Cloud API (future).
  provider              TEXT NOT NULL DEFAULT 'qr' CHECK (provider IN ('qr', 'meta')),
  -- Coarse status for UI
  status                TEXT NOT NULL DEFAULT 'disconnected'
                          CHECK (status IN ('connected', 'disconnected', 'error')),
  -- Fine-grained state managed by worker
  connection_state      TEXT NOT NULL DEFAULT 'DISCONNECTED'
                          CHECK (connection_state IN (
                            'DISCONNECTED', 'STARTING', 'AUTHENTICATING',
                            'QR_REQUIRED', 'PAIRING', 'CONNECTED',
                            'RECONNECTING', 'LOGGED_OUT', 'ERROR'
                          )),
  -- Current QR code data URI (base64). Cleared once paired or expired.
  -- Written by worker, read by future QR UI via service-role API route.
  qr_data_uri           TEXT,
  qr_generated_at       TIMESTAMPTZ,
  -- Worker identity / heartbeat
  worker_instance_id    TEXT,
  worker_started_at     TIMESTAMPTZ,
  last_heartbeat_at     TIMESTAMPTZ,
  last_connected_at     TIMESTAMPTZ,
  last_disconnected_at  TIMESTAMPTZ,
  last_activity_at      TIMESTAMPTZ,
  reconnect_attempts    INTEGER NOT NULL DEFAULT 0,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_accounts_account_idx
  ON whatsapp_accounts(account_id);
CREATE INDEX IF NOT EXISTS wa_accounts_state_idx
  ON whatsapp_accounts(connection_state)
  WHERE connection_state NOT IN ('DISCONNECTED', 'LOGGED_OUT');

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;

-- CRM users can read their account's WhatsApp status (for future UI).
DROP POLICY IF EXISTS "wa_accounts_select" ON whatsapp_accounts;
CREATE POLICY "wa_accounts_select" ON whatsapp_accounts
  FOR SELECT USING (
    account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid())
  );
-- Writes are service-role only (worker bypasses RLS via service-role client).
-- No INSERT/UPDATE/DELETE policies for normal users.

-- ── whatsapp_session_state ───────────────────────────────────────────────────
-- Encrypted Baileys auth/signal state. NEVER readable by frontend users.
-- Worker uses service-role client → RLS irrelevant, but we leave it enabled
-- with no permissive policies so a future anon/auth leak can't expose it.

CREATE TABLE IF NOT EXISTS whatsapp_session_state (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  whatsapp_account_id   UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  -- AES-256-GCM encrypted JSON of Baileys AuthenticationState.
  -- Format: iv:ciphertext:authTag (same as existing encryption.ts).
  encrypted_state       TEXT NOT NULL,
  -- Monotonically-bumped on every save so we can detect stale writes.
  version               INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_account_id)
);

CREATE INDEX IF NOT EXISTS wa_session_account_idx
  ON whatsapp_session_state(whatsapp_account_id);

ALTER TABLE whatsapp_session_state ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies. Worker uses service-role → bypasses RLS.
-- A logged-in browser user cannot read/write this table.

-- ── whatsapp_message_outbox ──────────────────────────────────────────────────
-- CRM inserts here; worker polls, claims with FOR UPDATE SKIP LOCKED,
-- delivers to WhatsApp, and marks sent/failed.

CREATE TABLE IF NOT EXISTS whatsapp_message_outbox (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id            UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  whatsapp_account_id   UUID NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  -- Links back to existing conversations/messages rows (nullable; can be
  -- created before the conversation row exists on an outbound flow).
  conversation_id       UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id            UUID REFERENCES messages(id) ON DELETE SET NULL,
  -- E.164 phone or JID (phone@s.whatsapp.net)
  recipient             TEXT NOT NULL,
  -- text | image | document | audio | video | template
  message_type          TEXT NOT NULL DEFAULT 'text',
  -- Full message payload — Baileys-sendable JSON
  payload               JSONB NOT NULL,
  -- Job state machine: pending → processing → sent | failed | cancelled
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts              INTEGER NOT NULL DEFAULT 0,
  max_attempts          INTEGER NOT NULL DEFAULT 3,
  scheduled_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at          TIMESTAMPTZ,
  error                 TEXT,
  -- Prevents duplicate sends. Callers supply a stable key
  -- (e.g. SHA-256 of conversation_id + message_id + attempt).
  idempotency_key       TEXT NOT NULL,
  -- Pessimistic lock: worker sets these when claiming a job.
  locked_at             TIMESTAMPTZ,
  locked_by             TEXT,        -- worker_instance_id
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS wa_outbox_status_sched_idx
  ON whatsapp_message_outbox(status, scheduled_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS wa_outbox_account_status_idx
  ON whatsapp_message_outbox(whatsapp_account_id, status);
CREATE INDEX IF NOT EXISTS wa_outbox_account_idx
  ON whatsapp_message_outbox(account_id);

ALTER TABLE whatsapp_message_outbox ENABLE ROW LEVEL SECURITY;

-- CRM agent+ can insert outbox jobs (for future send button wiring).
DROP POLICY IF EXISTS "wa_outbox_select" ON whatsapp_message_outbox;
CREATE POLICY "wa_outbox_select" ON whatsapp_message_outbox
  FOR SELECT USING (
    account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "wa_outbox_insert" ON whatsapp_message_outbox;
CREATE POLICY "wa_outbox_insert" ON whatsapp_message_outbox
  FOR INSERT WITH CHECK (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid()
        AND role IN ('agent', 'admin', 'owner')
    )
  );
-- UPDATE/DELETE for status tracking done by worker via service-role only.
