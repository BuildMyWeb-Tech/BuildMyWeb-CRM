-- ============================================================
-- 044_file_manager.sql — BMW CRM Phase 3: File Manager
--
-- A shared Explorer/Drive-style folder+file system used by both
-- the Projects module (files scoped to one project) and the Office
-- module, coming in Phase 4 (files scoped to the account overall —
-- `project_id IS NULL`). One bucket, one pair of tables, reused by
-- both call sites via a `project_id` tag rather than two separate
-- systems.
--
-- This is deliberately separate from `task_attachments`
-- (041_client_projects.sql) — task attachments are a quick,
-- flat, per-task upload list; this is a real folder tree you
-- navigate, rename things in, and selectively share.
--
-- SHARING MODEL: the `files` bucket stays private — there is no
-- per-object public/private toggle in Supabase Storage, only a
-- bucket-wide one. Instead, `is_public` + `share_token` on the
-- `files` row are the capability: a file only becomes reachable
-- without login through GET /api/files/public/[share_token], which
-- checks `is_public = true` server-side (service role) before
-- generating a short-lived signed URL and redirecting. Flipping
-- `is_public` back to false revokes the link immediately even
-- though the token value doesn't change — nothing about the
-- storage object itself is ever made public.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- FILE_FOLDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS file_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- NULL = an Office-level folder (account-wide). Set = scoped to
  -- that project's own file tree.
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES file_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_folders_account ON file_folders(account_id);
CREATE INDEX IF NOT EXISTS idx_file_folders_project ON file_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_file_folders_parent ON file_folders(parent_id);

ALTER TABLE file_folders ENABLE ROW LEVEL SECURITY;

-- Project-scoped folders follow Projects' existing viewer/agent
-- split. Office-scoped folders (project_id IS NULL) are admin-only
-- for now — Phase 4 layers a per-person checkbox on top of this via
-- office_access (043_bmw_office.sql), it does not replace this
-- floor.
DROP POLICY IF EXISTS "Viewers can read project folders" ON file_folders;
CREATE POLICY "Viewers can read project folders" ON file_folders FOR SELECT
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (project_id IS NULL AND is_account_member(account_id, 'admin'))
  );

DROP POLICY IF EXISTS "Agents can manage project folders" ON file_folders;
CREATE POLICY "Agents can manage project folders" ON file_folders FOR ALL
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (project_id IS NULL AND is_account_member(account_id, 'admin'))
  )
  WITH CHECK (
    (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (project_id IS NULL AND is_account_member(account_id, 'admin'))
  );

DROP TRIGGER IF EXISTS set_updated_at ON file_folders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON file_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FILES
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  -- NULL = sits at the root of its scope (Office root, or a
  -- project's root), not inside any folder.
  folder_id UUID REFERENCES file_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  share_token UUID NOT NULL DEFAULT uuid_generate_v4(),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_files_share_token ON files(share_token);
CREATE INDEX IF NOT EXISTS idx_files_account ON files(account_id);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read project files" ON files;
CREATE POLICY "Viewers can read project files" ON files FOR SELECT
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (project_id IS NULL AND is_account_member(account_id, 'admin'))
  );

DROP POLICY IF EXISTS "Agents can manage project files" ON files;
CREATE POLICY "Agents can manage project files" ON files FOR ALL
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (project_id IS NULL AND is_account_member(account_id, 'admin'))
  )
  WITH CHECK (
    (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (project_id IS NULL AND is_account_member(account_id, 'admin'))
  );

DROP TRIGGER IF EXISTS set_updated_at ON files;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STORAGE: files bucket
-- Path convention: files/{account_id}/{uuid}-{filename}
-- Private, always — see the sharing-model note above. 100 MB cap,
-- broad mime types (same list as task-attachments plus common
-- archive/text types you'd actually file in a drive).
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'files',
  'files',
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
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
    'video/mp4', 'video/webm', 'video/quicktime',
    'text/plain', 'text/csv', 'application/zip', 'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Bucket-level policies can only see {account_id} in the path, not
-- which `files` row an object belongs to — so they can't replicate
-- the table's project-viewer / office-admin split themselves. SELECT
-- is set to the least-restrictive floor (account viewer) so project
-- files remain downloadable by viewers; the REAL gate for office
-- files (project_id IS NULL) is the `files` table's own RLS above —
-- a viewer can't query an office file's row to learn its
-- storage_path in the first place, so they have nothing to read
-- from Storage even though the bucket policy alone wouldn't stop
-- them if they somehow already had the exact path string.
DROP POLICY IF EXISTS "Viewers can read project bucket files" ON storage.objects;
CREATE POLICY "Viewers can read project bucket files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'files'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'viewer')
  );

DROP POLICY IF EXISTS "Agents can upload to files bucket" ON storage.objects;
CREATE POLICY "Agents can upload to files bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'files'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'agent')
  );

DROP POLICY IF EXISTS "Agents can delete from files bucket" ON storage.objects;
CREATE POLICY "Agents can delete from files bucket"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'files'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'agent')
  );