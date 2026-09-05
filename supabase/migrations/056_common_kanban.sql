-- ============================================================
-- 056_common_kanban.sql — BMW CRM: unified cross-project Kanban
--
-- /kanban shows ONE board with ALL tasks from ALL projects, grouped
-- into a SHARED set of status columns — not each project's own
-- differently-named stages (that's what each project's own board,
-- under /projects/[id], is for). This requires an account-wide
-- status taxonomy independent of any single project's
-- pipeline_stages, since two projects can (and usually do) name
-- their columns differently.
--
-- `common_status_id` on project_tasks is nullable and additive —
-- it doesn't replace `stage_id` (still each project's own board
-- column) or touch it in any way. A task with common_status_id
-- NULL (every existing task, until this migration's backfill, and
-- any created through paths this migration doesn't touch) is
-- treated as belonging to the FIRST common status column by the
-- unified board — both at backfill time (below) and defensively at
-- render time, so nothing this migration doesn't know about (task
-- creation flows this migration doesn't modify) can end up
-- invisible on the unified board.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS kanban_common_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#94a3b8',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanban_common_statuses_account ON kanban_common_statuses(account_id);

ALTER TABLE kanban_common_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read common kanban statuses" ON kanban_common_statuses;
CREATE POLICY "Viewers can read common kanban statuses" ON kanban_common_statuses FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage common kanban statuses" ON kanban_common_statuses;
CREATE POLICY "Admins can manage common kanban statuses" ON kanban_common_statuses FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON kanban_common_statuses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON kanban_common_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- project_tasks gets an additive link to this shared taxonomy.
-- Moving a card on the unified board writes here — it never touches
-- stage_id, so each project's own board is completely unaffected.
-- ============================================================
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS common_status_id UUID REFERENCES kanban_common_statuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_project_tasks_common_status ON project_tasks(common_status_id);

-- Employees can move cards on the unified board (an update), same
-- floor as everything else they can already update on project_tasks
-- — no new policy needed since this is just a new column on a table
-- whose UPDATE policy already exists from 041_client_projects.sql.

-- ============================================================
-- Seed 4 default common statuses per account (To Do / In Progress /
-- Review / Done), then backfill every existing project_task with no
-- common_status_id to the first one — so the unified board isn't
-- empty-looking or missing cards the moment this ships.
-- ============================================================
DO $$
DECLARE
  acct RECORD;
  first_status_id UUID;
  status_names TEXT[] := ARRAY['To Do', 'In Progress', 'Review', 'Done'];
  status_colors TEXT[] := ARRAY['#94a3b8', '#60a5fa', '#facc15', '#22c55e'];
  i INTEGER;
BEGIN
  FOR acct IN SELECT id FROM accounts LOOP
    IF NOT EXISTS (SELECT 1 FROM kanban_common_statuses WHERE account_id = acct.id) THEN
      FOR i IN 1 .. array_length(status_names, 1) LOOP
        INSERT INTO kanban_common_statuses (account_id, name, color, position)
        VALUES (acct.id, status_names[i], status_colors[i], i)
        RETURNING id INTO first_status_id;

        IF i = 1 THEN
          UPDATE project_tasks
          SET common_status_id = first_status_id
          WHERE account_id = acct.id AND common_status_id IS NULL;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
