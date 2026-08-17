-- ============================================================
-- 041_client_projects.sql — BMW CRM Phase 2: Client Projects module
--
-- Reuses the existing `pipelines` / `pipeline_stages` tables as the
-- generic Kanban board scaffolding (they carry no sales-only
-- columns, so they're already a fine fit for a project board's
-- columns). Adds two new tables: `projects` (one per client
-- engagement) and `project_tasks` (cards on the board, analogous
-- to `deals` but without sales-specific fields).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE RESTRICT,
  client_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  owner_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  start_date DATE,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id);
CREATE INDEX IF NOT EXISTS idx_projects_pipeline ON projects(pipeline_id);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read projects" ON projects;
CREATE POLICY "Viewers can read projects" ON projects FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can manage projects" ON projects;
CREATE POLICY "Agents can manage projects" ON projects FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON projects;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PROJECT_TASKS  (cards on a project's Kanban board)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  assignee_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date DATE,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_stage ON project_tasks(stage_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assignee_profile_id);

ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read tasks" ON project_tasks;
CREATE POLICY "Viewers can read tasks" ON project_tasks FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can manage tasks" ON project_tasks;
CREATE POLICY "Agents can manage tasks" ON project_tasks FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON project_tasks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Note: a project's board columns (To Do / In Progress / Review /
-- Done, or whatever names you want) are just a `pipelines` row with
-- `name` like '<Project Name> Board' and its `pipeline_stages` —
-- created the same way the app already creates a sales pipeline.
-- No new "board" concept was introduced; project_tasks just points
-- at pipeline_stages instead of deals doing so.
