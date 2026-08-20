-- ============================================================
-- 049_daily_tasks.sql — BMW CRM: Daily Task
--
-- One board per account (auto-seeded below, same pattern as the
-- "BuildMyWeb Sales" pipeline from 040_sales_lead_fields.sql) —
-- unlike Projects (many boards) or standalone Kanban (many boards),
-- Daily Tasks is a single shared board everyone on the account
-- works from, matching the reference screenshot's one "Account
-- Planner Kanban" view. Reuses pipelines/pipeline_stages again for
-- the To Do / Ongoing / Review / Complete columns.
--
-- Fields deliberately exclude anything social-media-specific
-- (CTR/Impressions/Engagement/Platform/Slides) and the hardcoded
-- Designer field — assignee already covers "who's doing this",
-- and sector-specific fields (whatever a website/software/logo/
-- video job actually needs) belong in Custom Fields
-- (047_custom_fields.sql, entity_type = 'daily_task'), not hardcoded
-- columns that would only fit one sector.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  brief TEXT,
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  target_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_account ON daily_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_stage ON daily_tasks(stage_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_client ON daily_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_project ON daily_tasks(project_id);

ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read daily tasks" ON daily_tasks;
CREATE POLICY "Viewers can read daily tasks" ON daily_tasks FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Employees can update daily tasks" ON daily_tasks;
CREATE POLICY "Employees can update daily tasks" ON daily_tasks FOR UPDATE
  USING (is_account_member(account_id, 'employee'))
  WITH CHECK (is_account_member(account_id, 'employee'));

DROP POLICY IF EXISTS "Agents can create daily tasks" ON daily_tasks;
CREATE POLICY "Agents can create daily tasks" ON daily_tasks FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Agents can delete daily tasks" ON daily_tasks;
CREATE POLICY "Agents can delete daily tasks" ON daily_tasks FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON daily_tasks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON daily_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED: one "Daily Tasks" pipeline per account with 4 stages.
-- Same idempotent per-account seeding pattern as 040's Sales
-- pipeline — skipped for an account that already has one.
-- ============================================================
DO $$
DECLARE
  acct RECORD;
  new_pipeline_id UUID;
  stage_names TEXT[] := ARRAY['To Do', 'Ongoing', 'Review', 'Complete'];
  stage_colors TEXT[] := ARRAY['#94a3b8', '#facc15', '#60a5fa', '#22c55e'];
  i INTEGER;
BEGIN
  FOR acct IN SELECT id, owner_user_id FROM accounts LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pipelines WHERE account_id = acct.id AND name = 'Daily Tasks'
    ) THEN
      INSERT INTO pipelines (account_id, user_id, name)
      VALUES (acct.id, acct.owner_user_id, 'Daily Tasks')
      RETURNING id INTO new_pipeline_id;

      FOR i IN 1 .. array_length(stage_names, 1) LOOP
        INSERT INTO pipeline_stages (pipeline_id, name, position, color)
        VALUES (new_pipeline_id, stage_names[i], i, stage_colors[i]);
      END LOOP;
    END IF;
  END LOOP;
END $$;
