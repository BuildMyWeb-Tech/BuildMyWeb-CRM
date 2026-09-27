-- Payment installments: a JSONB array stored on each client_payment
-- row so multiple partial payment dates/amounts can be recorded
-- without a separate table. Each element:
--   { date: "YYYY-MM-DD", amount: number, note?: string }

ALTER TABLE client_payments
  ADD COLUMN IF NOT EXISTS installments JSONB NOT NULL DEFAULT '[]'::jsonb;
