-- ============================================================
-- 052_client_payments.sql — BMW CRM: Account Management
-- (client payments + revenue-split allocations)
--
-- Modeled directly on the "Client Amount" sheet in the Excel you
-- shared: each row there was one payment received from a client,
-- with the amount then split across a "Company" column plus a
-- Role+Amount pair per named team member (Ajai, Mauli, Harini...).
-- That wide per-person-column shape doesn't survive team changes —
-- normalized here into two tables instead: `client_payments` (one
-- row per payment received — "first payment, then second, then n"
-- is just more rows, one client can have many) and
-- `payment_allocations` (one row per split of that payment, to
-- either 'company' or a specific team member — the "array of
-- allocations" saved alongside each payment).
--
-- RLS is admin-only for BOTH tables, on every operation, including
-- read — a deliberate, more conservative default than the rest of
-- this app's viewer-read/agent-manage pattern, since this data is
-- compensation/revenue-split information. Loosen it later
-- (is_account_member(account_id, 'viewer') for SELECT, etc.) if
-- broader visibility turns out to be wanted.
--
-- Uses gen_random_uuid() (built into Postgres core since v13, no
-- extension required) instead of this project's usual
-- uuid_generate_v4() (from the uuid-ossp extension) — that function
-- kept failing here with "does not exist" even after a defensive
-- `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` was added, which
-- points to a search_path issue (the extension likely lives in a
-- schema, e.g. `extensions`, not on the path the migration runner
-- resolves unqualified calls against) rather than a missing
-- extension. Sidestepping the dependency entirely is more reliable
-- than continuing to chase that.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_description TEXT,
  received_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  domain_fee NUMERIC(12, 2),
  hosting_fee NUMERIC(12, 2),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_payments_account ON client_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_received_date ON client_payments(received_date);

ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage client payments" ON client_payments;
CREATE POLICY "Admins can manage client payments" ON client_payments FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON client_payments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON client_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PAYMENT_ALLOCATIONS — one row per split of a payment, to the
-- company or to a specific team member.
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('company', 'team_member')),
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role_label TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (recipient_type = 'company' AND recipient_user_id IS NULL)
    OR (recipient_type = 'team_member' AND recipient_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_recipient ON payment_allocations(recipient_user_id);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage payment allocations" ON payment_allocations;
CREATE POLICY "Admins can manage payment allocations" ON payment_allocations FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));