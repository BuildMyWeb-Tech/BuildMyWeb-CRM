-- Migration 088: Time Tracker, Expense Tracker, Review Tracker tables

-- ── Time entries ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name TEXT,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_name   TEXT,
  hours       NUMERIC(6,2) NOT NULL DEFAULT 0,
  entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_entries' AND policyname='time_entries_account') THEN
    CREATE POLICY "time_entries_account" ON time_entries
      FOR ALL USING (
        account_id IN (
          SELECT account_id FROM profiles WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_time_entries_account ON time_entries(account_id, entry_date DESC);

-- ── Expenses ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other',
  amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  expense_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='expenses' AND policyname='expenses_account') THEN
    CREATE POLICY "expenses_account" ON expenses
      FOR ALL USING (
        account_id IN (
          SELECT account_id FROM profiles WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account_id, expense_date DESC);

-- ── Reviews ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_name  TEXT NOT NULL,
  project_name TEXT,
  rating       NUMERIC(2,1) NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  review_text  TEXT,
  review_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  is_public    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='client_reviews' AND policyname='client_reviews_account') THEN
    CREATE POLICY "client_reviews_account" ON client_reviews
      FOR ALL USING (
        account_id IN (
          SELECT account_id FROM profiles WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_reviews_account ON client_reviews(account_id, review_date DESC);
