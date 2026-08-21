-- ============================================================
-- 044_file_manager.sql — BMW CRM Phase 3: File Manager
--
-- A shared Explorer/Drive-style folder + file system used by:
--
--   1. Projects
--      project_id IS NOT NULL
--
--   2. Office
--      project_id IS NULL
--
-- This is deliberately separate from task_attachments
-- (041_client_projects.sql).
--
-- task_attachments:
--   Simple per-task upload list.
--
-- files / file_folders:
--   Full Drive/Explorer-style file manager with:
--   - folders
--   - nested folders
--   - files
--   - rename
--   - delete
--   - project scoping
--   - Office scoping
--   - share links
--
-- IMPORTANT:
-- This migration uses gen_random_uuid() instead of
-- uuid_generate_v4().
--
-- The Supabase project does not currently expose
-- uuid_generate_v4(), while gen_random_uuid() is available.
--
-- Idempotent — safe to run multiple times.
-- ============================================================


-- ============================================================
-- FILE_FOLDERS
-- ============================================================
--
-- project_id:
--
--   NOT NULL
--      = Project file folder
--
--   NULL
--      = Office-level folder
--
-- parent_id:
--
--   NULL
--      = Root folder
--
--   UUID
--      = Nested folder
--
-- ============================================================

CREATE TABLE IF NOT EXISTS file_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  project_id UUID
    REFERENCES projects(id)
    ON DELETE CASCADE,

  parent_id UUID
    REFERENCES file_folders(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  created_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- FILE_FOLDERS INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_file_folders_account
  ON file_folders(account_id);

CREATE INDEX IF NOT EXISTS idx_file_folders_project
  ON file_folders(project_id);

CREATE INDEX IF NOT EXISTS idx_file_folders_parent
  ON file_folders(parent_id);


-- ============================================================
-- FILE_FOLDERS RLS
-- ============================================================

ALTER TABLE file_folders ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- FILE_FOLDERS SELECT
-- ============================================================
--
-- Project folders:
--   Account viewers can read.
--
-- Office folders:
--   Requires Office access.
--
-- has_office_access() was created by 042_bmw_office.sql.
--
-- ============================================================

DROP POLICY IF EXISTS "Viewers can read project folders"
  ON file_folders;

CREATE POLICY "Viewers can read project folders"
  ON file_folders
  FOR SELECT
  USING (
    (
      project_id IS NOT NULL
      AND is_account_member(account_id, 'viewer')
    )
    OR
    (
      project_id IS NULL
      AND has_office_access(account_id)
    )
  );


-- ============================================================
-- FILE_FOLDERS INSERT / UPDATE / DELETE
-- ============================================================
--
-- Project folders:
--   Agents can manage.
--
-- Office folders:
--   Admins can manage.
--
-- Office access for ordinary members is VIEW ONLY.
--
-- ============================================================

DROP POLICY IF EXISTS "Agents can manage project folders"
  ON file_folders;

CREATE POLICY "Agents can manage project folders"
  ON file_folders
  FOR ALL
  USING (
    (
      project_id IS NOT NULL
      AND is_account_member(account_id, 'agent')
    )
    OR
    (
      project_id IS NULL
      AND is_account_member(account_id, 'admin')
    )
  )
  WITH CHECK (
    (
      project_id IS NOT NULL
      AND is_account_member(account_id, 'agent')
    )
    OR
    (
      project_id IS NULL
      AND is_account_member(account_id, 'admin')
    )
  );


-- ============================================================
-- FILE_FOLDERS UPDATED_AT
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at
  ON file_folders;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON file_folders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- FILES
-- ============================================================
--
-- project_id:
--
--   NOT NULL
--      = Project file
--
--   NULL
--      = Office file
--
-- folder_id:
--
--   NULL
--      = File is at root
--
--   UUID
--      = File belongs to folder
--
-- is_public:
--
--   FALSE
--      = private
--
--   TRUE
--      = application can expose a share link
--
-- share_token:
--      Unique capability token used by the application when
--      creating public file links.
--
-- ============================================================

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  project_id UUID
    REFERENCES projects(id)
    ON DELETE CASCADE,

  folder_id UUID
    REFERENCES file_folders(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL,

  storage_path TEXT NOT NULL,

  file_size INTEGER,

  mime_type TEXT,

  is_public BOOLEAN NOT NULL DEFAULT FALSE,

  share_token UUID NOT NULL DEFAULT gen_random_uuid(),

  uploaded_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- FILES INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_share_token
  ON files(share_token);

CREATE INDEX IF NOT EXISTS idx_files_account
  ON files(account_id);

CREATE INDEX IF NOT EXISTS idx_files_project
  ON files(project_id);

CREATE INDEX IF NOT EXISTS idx_files_folder
  ON files(folder_id);


-- ============================================================
-- FILES RLS
-- ============================================================

ALTER TABLE files ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- FILES SELECT
-- ============================================================
--
-- Project files:
--   Account viewers can read.
--
-- Office files:
--   Requires Office access.
--
-- ============================================================

DROP POLICY IF EXISTS "Viewers can read project files"
  ON files;

CREATE POLICY "Viewers can read project files"
  ON files
  FOR SELECT
  USING (
    (
      project_id IS NOT NULL
      AND is_account_member(account_id, 'viewer')
    )
    OR
    (
      project_id IS NULL
      AND has_office_access(account_id)
    )
  );


-- ============================================================
-- FILES INSERT / UPDATE / DELETE
-- ============================================================
--
-- Project files:
--   Agents can manage.
--
-- Office files:
--   Admins can manage.
--
-- ============================================================

DROP POLICY IF EXISTS "Agents can manage project files"
  ON files;

CREATE POLICY "Agents can manage project files"
  ON files
  FOR ALL
  USING (
    (
      project_id IS NOT NULL
      AND is_account_member(account_id, 'agent')
    )
    OR
    (
      project_id IS NULL
      AND is_account_member(account_id, 'admin')
    )
  )
  WITH CHECK (
    (
      project_id IS NOT NULL
      AND is_account_member(account_id, 'agent')
    )
    OR
    (
      project_id IS NULL
      AND is_account_member(account_id, 'admin')
    )
  );


-- ============================================================
-- FILES UPDATED_AT
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at
  ON files;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON files
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- STORAGE BUCKET
-- ============================================================
--
-- Bucket:
--   files
--
-- Private bucket.
--
-- Application controls public sharing through:
--
--   files.is_public
--   files.share_token
--
-- The actual storage object remains private.
--
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'files',
  'files',
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

    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',

    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-m4a',

    'video/mp4',
    'video/webm',
    'video/quicktime',

    'text/plain',
    'text/csv',

    'application/zip',
    'application/json'
  ]
)
ON CONFLICT (id)
DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ============================================================
-- STORAGE SELECT POLICY
-- ============================================================
--
-- The storage path convention is:
--
-- files/{account_id}/{uuid}-{filename}
--
-- The account_id is the first folder in the path.
--
-- Project / Office access is ultimately enforced by the
-- application-level files table RLS.
--
-- ============================================================

DROP POLICY IF EXISTS "Viewers can read project bucket files"
  ON storage.objects;

CREATE POLICY "Viewers can read project bucket files"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'files'
    AND is_account_member(
      (storage.foldername(name))[1]::uuid,
      'viewer'
    )
  );


-- ============================================================
-- STORAGE INSERT
-- ============================================================

DROP POLICY IF EXISTS "Agents can upload to files bucket"
  ON storage.objects;

CREATE POLICY "Agents can upload to files bucket"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'files'
    AND is_account_member(
      (storage.foldername(name))[1]::uuid,
      'agent'
    )
  );


-- ============================================================
-- STORAGE DELETE
-- ============================================================

DROP POLICY IF EXISTS "Agents can delete from files bucket"
  ON storage.objects;

CREATE POLICY "Agents can delete from files bucket"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'files'
    AND is_account_member(
      (storage.foldername(name))[1]::uuid,
      'agent'
    )
  );


-- ============================================================
-- END OF 044_file_manager.sql
-- ============================================================