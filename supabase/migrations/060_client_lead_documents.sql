-- ============================================================
-- 060_client_lead_documents.sql — BMW CRM: documents on a Client
-- Enquiry (formerly "Client Leads/Enquiry")
--
-- Reuses the existing generic File Manager (files/file_folders,
-- 043_file_manager.sql, extended for clients in 047_client_directory)
-- rather than building a parallel documents table — a lead's
-- quotation PDF / requirements doc is the exact same shape of thing
-- (name, storage path, folders, rename/share/preview) the File
-- Manager already handles for Projects/Office/Clients. Adds a third
-- mutually-exclusive scope column, same pattern as `client_id`.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE files
ADD COLUMN IF NOT EXISTS lead_id UUID
REFERENCES client_leads(id)
ON DELETE CASCADE;

ALTER TABLE file_folders
ADD COLUMN IF NOT EXISTS lead_id UUID
REFERENCES client_leads(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_files_lead ON files(lead_id);
CREATE INDEX IF NOT EXISTS idx_file_folders_lead ON file_folders(lead_id);

-- ============================================================
-- Extend the existing file/folder RLS to cover the lead_id scope,
-- same "agent can manage, viewer can read" shape the client_id
-- branch already uses — see 047_client_directory.sql.
-- ============================================================

DROP POLICY IF EXISTS "Viewers can read project folders" ON file_folders;
CREATE POLICY "Viewers can read project folders" ON file_folders FOR SELECT
USING (
  (project_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
  OR (client_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
  OR (lead_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
  OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND has_office_access(account_id))
);

DROP POLICY IF EXISTS "Agents can manage project folders" ON file_folders;
CREATE POLICY "Agents can manage project folders" ON file_folders FOR ALL
USING (
  (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (client_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (lead_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND is_account_member(account_id, 'admin'))
)
WITH CHECK (
  (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (client_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (lead_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND is_account_member(account_id, 'admin'))
);

DROP POLICY IF EXISTS "Viewers can read project files" ON files;
CREATE POLICY "Viewers can read project files" ON files FOR SELECT
USING (
  (project_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
  OR (client_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
  OR (lead_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
  OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND has_office_access(account_id))
);

DROP POLICY IF EXISTS "Agents can manage project files" ON files;
CREATE POLICY "Agents can manage project files" ON files FOR ALL
USING (
  (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (client_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (lead_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND is_account_member(account_id, 'admin'))
)
WITH CHECK (
  (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (client_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (lead_id IS NOT NULL AND is_account_member(account_id, 'agent'))
  OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND is_account_member(account_id, 'admin'))
);
