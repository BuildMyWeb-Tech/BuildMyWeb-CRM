-- ============================================================
-- 041_client_projects.sql
-- BMW CRM Phase 2: Client Projects module
--
-- Creates:
--   1. projects
--   2. project_tasks
--   3. task_attachments
--   4. task-attachments Storage bucket + policies
--
-- IMPORTANT:
-- Uses gen_random_uuid() instead of uuid_generate_v4()
-- because Supabase projects commonly have pgcrypto available
-- while uuid-ossp may not be enabled.
--
-- Idempotent / safe to rerun.
-- ============================================================


-- ============================================================
-- EXTENSION
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  pipeline_id UUID NOT NULL
    REFERENCES pipelines(id)
    ON DELETE RESTRICT,

  client_contact_id UUID
    REFERENCES contacts(id)
    ON DELETE SET NULL,

  client_name TEXT,

  name TEXT NOT NULL,

  description TEXT,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (
      status IN (
        'active',
        'on_hold',
        'completed',
        'cancelled'
      )
    ),

  owner_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  start_date DATE,

  due_date DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- PROJECTS - ENSURE COLUMNS EXIST
--
-- CREATE TABLE IF NOT EXISTS does NOT add columns when an
-- older projects table already exists.
-- These ALTER statements make the migration safer.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS account_id UUID;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pipeline_id UUID;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_contact_id UUID;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_name TEXT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status TEXT;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS owner_user_id UUID;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS start_date DATE;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;


-- ============================================================
-- PROJECT INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_projects_account
  ON projects(account_id);

CREATE INDEX IF NOT EXISTS idx_projects_pipeline
  ON projects(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_projects_client_contact
  ON projects(client_contact_id);

CREATE INDEX IF NOT EXISTS idx_projects_owner
  ON projects(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects(status);


-- ============================================================
-- PROJECTS RLS
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Viewers can read projects"
  ON projects;

CREATE POLICY "Viewers can read projects"
  ON projects
  FOR SELECT
  USING (
    is_account_member(account_id, 'viewer')
  );


DROP POLICY IF EXISTS "Agents can manage projects"
  ON projects;

CREATE POLICY "Agents can manage projects"
  ON projects
  FOR ALL
  USING (
    is_account_member(account_id, 'agent')
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
  );


-- ============================================================
-- PROJECTS UPDATED_AT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS set_projects_updated_at
  ON projects;

CREATE TRIGGER set_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PROJECT_TASKS
-- ============================================================

CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  project_id UUID NOT NULL
    REFERENCES projects(id)
    ON DELETE CASCADE,

  stage_id UUID NOT NULL
    REFERENCES pipeline_stages(id)
    ON DELETE RESTRICT,

  title TEXT NOT NULL,

  description TEXT,

  assignee_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (
      priority IN (
        'low',
        'normal',
        'high',
        'urgent'
      )
    ),

  due_date DATE,

  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,

  position INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- PROJECT_TASKS - ENSURE COLUMNS EXIST
-- ============================================================

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS account_id UUID;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS stage_id UUID;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS priority TEXT;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS checklist JSONB;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS position INTEGER;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;


-- ============================================================
-- TASK INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_project_tasks_account
  ON project_tasks(account_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project
  ON project_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_stage
  ON project_tasks(stage_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee
  ON project_tasks(assignee_user_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_due_date
  ON project_tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_project_tasks_priority
  ON project_tasks(priority);


-- ============================================================
-- PROJECT_TASKS RLS
-- ============================================================

ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Viewers can read tasks"
  ON project_tasks;

CREATE POLICY "Viewers can read tasks"
  ON project_tasks
  FOR SELECT
  USING (
    is_account_member(account_id, 'viewer')
  );


DROP POLICY IF EXISTS "Agents can manage tasks"
  ON project_tasks;

CREATE POLICY "Agents can manage tasks"
  ON project_tasks
  FOR ALL
  USING (
    is_account_member(account_id, 'agent')
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
  );


-- ============================================================
-- PROJECT_TASKS UPDATED_AT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS set_project_tasks_updated_at
  ON project_tasks;

CREATE TRIGGER set_project_tasks_updated_at
BEFORE UPDATE ON project_tasks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- TASK_ATTACHMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  task_id UUID NOT NULL
    REFERENCES project_tasks(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  storage_path TEXT NOT NULL,

  file_size INTEGER,

  mime_type TEXT,

  uploaded_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- TASK_ATTACHMENTS - ENSURE COLUMNS EXIST
-- ============================================================

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS account_id UUID;

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS task_id UUID;

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS file_size INTEGER;

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS uploaded_by UUID;

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;


-- ============================================================
-- TASK_ATTACHMENT INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_task_attachments_account
  ON task_attachments(account_id);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task
  ON task_attachments(task_id);

CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by
  ON task_attachments(uploaded_by);


-- ============================================================
-- TASK_ATTACHMENTS RLS
-- ============================================================

ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Viewers can read task attachments"
  ON task_attachments;

CREATE POLICY "Viewers can read task attachments"
  ON task_attachments
  FOR SELECT
  USING (
    is_account_member(account_id, 'viewer')
  );


DROP POLICY IF EXISTS "Agents can manage task attachments"
  ON task_attachments;

CREATE POLICY "Agents can manage task attachments"
  ON task_attachments
  FOR ALL
  USING (
    is_account_member(account_id, 'agent')
  )
  WITH CHECK (
    is_account_member(account_id, 'agent')
  );


-- ============================================================
-- STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'task-attachments',
  'task-attachments',
  FALSE,
  104857600,
  ARRAY[
    'application/pdf',

    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

    'text/plain',
    'text/csv',

    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',

    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-m4a',

    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id)
DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ============================================================
-- STORAGE RLS - READ
-- ============================================================

DROP POLICY IF EXISTS "Account members can read task attachments"
  ON storage.objects;

CREATE POLICY "Account members can read task attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'task-attachments'
  AND is_account_member(
    (storage.foldername(name))[1]::uuid,
    'viewer'
  )
);


-- ============================================================
-- STORAGE RLS - UPLOAD
-- ============================================================

DROP POLICY IF EXISTS "Agents can upload task attachments"
  ON storage.objects;

CREATE POLICY "Agents can upload task attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'task-attachments'
  AND is_account_member(
    (storage.foldername(name))[1]::uuid,
    'agent'
  )
);


-- ============================================================
-- STORAGE RLS - UPDATE
-- ============================================================

DROP POLICY IF EXISTS "Agents can update task attachments"
  ON storage.objects;

CREATE POLICY "Agents can update task attachments"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'task-attachments'
  AND is_account_member(
    (storage.foldername(name))[1]::uuid,
    'agent'
  )
)
WITH CHECK (
  bucket_id = 'task-attachments'
  AND is_account_member(
    (storage.foldername(name))[1]::uuid,
    'agent'
  )
);


-- ============================================================
-- STORAGE RLS - DELETE
-- ============================================================

DROP POLICY IF EXISTS "Agents can delete task attachments"
  ON storage.objects;

CREATE POLICY "Agents can delete task attachments"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'task-attachments'
  AND is_account_member(
    (storage.foldername(name))[1]::uuid,
    'agent'
  )
);


-- ============================================================
-- END OF 041_client_projects.sql
-- ============================================================