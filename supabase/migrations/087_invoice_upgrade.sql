-- Invoice upgrade: add line items, payments, client/project links, auto-numbering
-- Migration 087

-- Add new columns to invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id       UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS po_number        TEXT,
  ADD COLUMN IF NOT EXISTS customer_note    TEXT,
  ADD COLUMN IF NOT EXISTS internal_note    TEXT,
  ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill total_amount from amount for existing records
UPDATE invoices SET total_amount = amount, balance_due = amount WHERE total_amount = 0;

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  description   TEXT NOT NULL DEFAULT '',
  quantity      NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  unit_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoice_items' AND policyname='invoice_items_account') THEN
    CREATE POLICY "invoice_items_account" ON invoice_items
      FOR ALL USING (
        invoice_id IN (
          SELECT id FROM invoices WHERE account_id IN (
            SELECT account_id FROM profiles WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- Invoice payments
CREATE TABLE IF NOT EXISTS invoice_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount          NUMERIC(14,2) NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'bank_transfer',
  reference       TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoice_payments' AND policyname='invoice_payments_account') THEN
    CREATE POLICY "invoice_payments_account" ON invoice_payments
      FOR ALL USING (
        invoice_id IN (
          SELECT id FROM invoices WHERE account_id IN (
            SELECT account_id FROM profiles WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(account_id, client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(account_id, project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_public_token ON invoices(public_token);

-- Extend status check to include new statuses
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft','sent','viewed','paid','partially_paid','overdue','cancelled','void'));

-- Update existing 'paid' status records that might have different paid_amount
UPDATE invoices SET paid_amount = total_amount, balance_due = 0 WHERE status = 'paid';
