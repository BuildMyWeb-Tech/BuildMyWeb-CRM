-- ============================================================
-- 048_kanban_boards.sql — BMW CRM: standalone Kanban
--
-- A third kind of board, distinct from Sales' pipeline and
-- Projects' per-project task board: create one ad-hoc, not tied to
-- any project or client, for internal planning. Reuses
-- `pipelines`/`pipeline_stages` again for the column scaffolding
-- (same pattern as Sales and Projects) — `kanban_boards` is a thin
-- wrapper row that marks a pipeline as "this is a standalone
-- board" so listing them is a simple query instead of having to
-- infer it from what does/doesn't reference a pipeline elsewhere.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS kanban_boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanban_boards_account ON kanban_boards(account_id);

ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read kanban boards" ON kanban_boards;
CREATE POLICY "Viewers can read kanban boards" ON kanban_boards FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Employees can update kanban boards" ON kanban_boards;
CREATE POLICY "Employees can update kanban boards" ON kanban_boards FOR UPDATE
  USING (is_account_member(account_id, 'employee'))
  WITH CHECK (is_account_member(account_id, 'employee'));

DROP POLICY IF EXISTS "Agents can create kanban boards" ON kanban_boards;
CREATE POLICY "Agents can create kanban boards" ON kanban_boards FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Agents can delete kanban boards" ON kanban_boards;
CREATE POLICY "Agents can delete kanban boards" ON kanban_boards FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON kanban_boards;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON kanban_boards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- KANBAN_CARDS — cards on a standalone board, same shape as
-- project_tasks (041_client_projects.sql) minus the project link.
-- ============================================================
CREATE TABLE IF NOT EXISTS kanban_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date DATE,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kanban_cards_board ON kanban_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_stage ON kanban_cards(stage_id);

ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read kanban cards" ON kanban_cards;
CREATE POLICY "Viewers can read kanban cards" ON kanban_cards FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Employees can update kanban cards" ON kanban_cards;
CREATE POLICY "Employees can update kanban cards" ON kanban_cards FOR UPDATE
  USING (is_account_member(account_id, 'employee'))
  WITH CHECK (is_account_member(account_id, 'employee'));

DROP POLICY IF EXISTS "Agents can create kanban cards" ON kanban_cards;
CREATE POLICY "Agents can create kanban cards" ON kanban_cards FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Agents can delete kanban cards" ON kanban_cards;
CREATE POLICY "Agents can delete kanban cards" ON kanban_cards FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON kanban_cards;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON kanban_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
