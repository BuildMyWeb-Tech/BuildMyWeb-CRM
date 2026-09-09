-- ============================================================
-- 068_stage_uniform_future_client_schedule.sql
--
-- 1. kanban_cards.assignee_user_ids — same multi-assignee array
--    pattern as 067 gave project_tasks/daily_tasks, extended to
--    standalone Kanban cards.
--
-- 2. project_tasks.show_date / daily_tasks.show_date — "schedule for
--    later": a task with a future show_date is hidden from the
--    default task list until that date arrives, surfaced instead
--    under a "Scheduled" toggle near the other quick filters. NULL
--    (the default) means "show immediately," so every existing task
--    is unaffected.
--
-- 3. future_clients — a 4th outcome for a Client Enquiry lead
--    (alongside Confirm / Reject / Hold): "maybe later." Moving a
--    lead here deletes it from client_leads, same pattern as
--    Confirm/Reject, just landing in this table instead of `clients`.
--
-- 4. DATA FIX: every project's own board currently has whatever
--    stages it was seeded with at different points in this app's
--    history — some got "Ongoing", some got "In Progress" for what's
--    meant to be the same stage, and none had "Hold" or "Waiting on
--    Client". This normalizes every existing project pipeline to the
--    same stage set: To Do, In Progress, Hold, Waiting on Client,
--    Review, Done — merging an "Ongoing" stage's tasks into
--    "In Progress" (creating it if that project didn't have one)
--    rather than leaving Ongoing's tasks orphaned, then adding
--    Hold/Waiting on Client wherever missing. New projects created
--    after this migration already get this same set from
--    DEFAULT_STAGES in the app code (kept in sync separately).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS assignee_user_ids UUID[] NOT NULL DEFAULT '{}';
UPDATE kanban_cards SET assignee_user_ids = ARRAY[assignee_user_id]
  WHERE assignee_user_id IS NOT NULL AND assignee_user_ids = '{}';
CREATE INDEX IF NOT EXISTS idx_kanban_cards_assignee_ids ON kanban_cards USING GIN (assignee_user_ids);

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS show_date DATE;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS show_date DATE;
CREATE INDEX IF NOT EXISTS idx_project_tasks_show_date ON project_tasks(show_date) WHERE show_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_tasks_show_date ON daily_tasks(show_date) WHERE show_date IS NOT NULL;

-- ============================================================
-- FUTURE_CLIENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS future_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  client_name TEXT,
  phone TEXT,
  notes TEXT,
  source_lead_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_future_clients_account ON future_clients(account_id);

ALTER TABLE future_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read future clients" ON future_clients;
CREATE POLICY "Viewers can read future clients" ON future_clients FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can create future clients" ON future_clients;
CREATE POLICY "Agents can create future clients" ON future_clients FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Employees can update future clients" ON future_clients;
CREATE POLICY "Employees can update future clients" ON future_clients FOR UPDATE
  USING (is_account_member(account_id, 'employee'))
  WITH CHECK (is_account_member(account_id, 'employee'));

DROP POLICY IF EXISTS "Agents can delete future clients" ON future_clients;
CREATE POLICY "Agents can delete future clients" ON future_clients FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON future_clients;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON future_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DATA FIX: normalize every project's stage set
-- ============================================================

DO $$
DECLARE
  proj RECORD;
  ongoing_stage RECORD;
  in_progress_stage RECORD;
  max_pos INTEGER;
BEGIN
  FOR proj IN SELECT DISTINCT pipeline_id FROM projects WHERE pipeline_id IS NOT NULL LOOP
    -- Merge "Ongoing" into "In Progress" (case-insensitive), creating
    -- In Progress if this pipeline doesn't have one yet.
    SELECT * INTO ongoing_stage FROM pipeline_stages
      WHERE pipeline_id = proj.pipeline_id AND name ILIKE 'ongoing' LIMIT 1;
    IF FOUND THEN
      SELECT * INTO in_progress_stage FROM pipeline_stages
        WHERE pipeline_id = proj.pipeline_id AND name ILIKE 'in progress' LIMIT 1;
      IF NOT FOUND THEN
        -- No In Progress stage yet — just rename Ongoing in place.
        UPDATE pipeline_stages SET name = 'In Progress' WHERE id = ongoing_stage.id;
      ELSE
        -- Both exist — move Ongoing's tasks into In Progress, then
        -- drop Ongoing (FK is ON DELETE RESTRICT, so tasks must move first).
        UPDATE project_tasks SET stage_id = in_progress_stage.id WHERE stage_id = ongoing_stage.id;
        DELETE FROM pipeline_stages WHERE id = ongoing_stage.id;
      END IF;
    END IF;

    SELECT COALESCE(MAX(position), 0) INTO max_pos FROM pipeline_stages WHERE pipeline_id = proj.pipeline_id;

    IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE pipeline_id = proj.pipeline_id AND name ILIKE 'hold') THEN
      max_pos := max_pos + 1;
      INSERT INTO pipeline_stages (pipeline_id, name, position, color)
      VALUES (proj.pipeline_id, 'Hold', max_pos, '#f59e0b');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE pipeline_id = proj.pipeline_id AND name ILIKE 'waiting on client') THEN
      max_pos := max_pos + 1;
      INSERT INTO pipeline_stages (pipeline_id, name, position, color)
      VALUES (proj.pipeline_id, 'Waiting on Client', max_pos, '#a855f7');
    END IF;
  END LOOP;
END $$;
