-- Migration 071: Client 360 fields, project progress, enhanced payments
-- • Add progress_percentage to projects (manual 0-100)
-- • Add industry/phone/email/owner/next_follow_up to clients
-- • Add client_notes table
-- • Extend client_payments: status, payment_method, transaction_id,
--   project_id, expected_date; make received_date nullable

-- ── Projects: manual progress ─────────────────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0
    CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- ── Clients: extra fields ─────────────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS industry             TEXT,
  ADD COLUMN IF NOT EXISTS phone                TEXT,
  ADD COLUMN IF NOT EXISTS email                TEXT,
  ADD COLUMN IF NOT EXISTS owner_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_follow_up_at    TIMESTAMPTZ;

-- ── Client notes table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note_text   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_notes_client_id_idx ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS client_notes_account_id_idx ON client_notes(account_id);

-- RLS for client_notes
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_notes_viewer_select" ON client_notes;
CREATE POLICY "client_notes_viewer_select" ON client_notes
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "client_notes_employee_insert" ON client_notes;
CREATE POLICY "client_notes_employee_insert" ON client_notes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND is_account_member(account_id, 'viewer')
  );

DROP POLICY IF EXISTS "client_notes_owner_delete" ON client_notes;
CREATE POLICY "client_notes_owner_delete" ON client_notes
  FOR DELETE USING (
    auth.uid() = user_id OR is_account_member(account_id, 'admin')
  );

-- ── client_payments: enhanced fields ─────────────────────────────────────

-- Make received_date nullable (expected/future payments haven't been received)
ALTER TABLE client_payments
  ALTER COLUMN received_date DROP NOT NULL;

ALTER TABLE client_payments
  ADD COLUMN IF NOT EXISTS project_id       UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method   TEXT,
  ADD COLUMN IF NOT EXISTS transaction_id   TEXT,
  ADD COLUMN IF NOT EXISTS expected_date    DATE,
  ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'paid'
    CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded'));

-- Backfill: all existing rows are already-received payments
UPDATE client_payments
  SET status = 'paid'
  WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS client_payments_project_id_idx ON client_payments(project_id);
CREATE INDEX IF NOT EXISTS client_payments_status_idx ON client_payments(status);
