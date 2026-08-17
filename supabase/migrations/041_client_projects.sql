-- ============================================================
-- 041_client_projects.sql — BMW CRM Phase 2: Client Projects module
--
-- Reuses `pipelines` / `pipeline_stages` as the board/column
-- scaffolding for each project (one pipeline per project). Adds
-- `projects`, `project_tasks` (cards on the board), and
-- `task_attachments` (any file type — docs, PDFs, slides, images,
-- audio, video).
--
-- Client link is OPTIONAL and dual-mode per BMW's call: a project
-- can point at a real `contacts` row (client_contact_id) OR just
-- carry a free-text client_name, since not every project traces
-- back to a Sales lead.
--
-- `owner_user_id` / `assignee_user_id` reference auth.users(id)
-- directly (not profiles.id) to match the rest of the app's
-- convention (contacts.user_id, deals.user_id) and the existing
-- GET /api/account/members response shape (AccountMember.user_id).
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
  client_name TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date DATE,
  -- [{ "text": "...", "done": false }, ...] — simple checklist, no
  -- separate table since it's always read/written as a whole unit.
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_stage ON project_tasks(stage_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assignee_user_id);

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

-- ============================================================
-- TASK_ATTACHMENTS — metadata; files live in the task-attachments
-- bucket. Broad mime types per BMW: docs, PDFs, slides, images,
-- audio, video.
-- ============================================================
CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read task attachments" ON task_attachments;
CREATE POLICY "Viewers can read task attachments" ON task_attachments FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can manage task attachments" ON task_attachments;
CREATE POLICY "Agents can manage task attachments" ON task_attachments FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

-- ============================================================
-- STORAGE: task-attachments bucket
-- Path convention: task-attachments/{account_id}/{task_id}/{filename}
-- Private (not public) — same reasoning as office-documents.
-- Uploaded directly from the browser via the RLS-scoped Supabase
-- client, matching the app's existing avatar-upload pattern
-- (src/components/settings/profile-form.tsx) rather than a server
-- API route.
--
-- 100 MB cap covers short video/audio clips without inviting
-- accidental huge uploads. Raise file_size_limit here (and check
-- your Supabase plan's storage quota) if you need bigger files.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  FALSE,
  104857600, -- 100 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Account members can read task attachments" ON storage.objects;
CREATE POLICY "Account members can read task attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'task-attachments'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'viewer')
  );

DROP POLICY IF EXISTS "Agents can upload task attachments" ON storage.objects;
CREATE POLICY "Agents can upload task attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'agent')
  );

DROP POLICY IF EXISTS "Agents can delete task attachments" ON storage.objects;
CREATE POLICY "Agents can delete task attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'task-attachments'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'agent')
  );