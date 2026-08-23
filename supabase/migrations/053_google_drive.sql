-- ============================================================
-- 053_google_drive.sql — BMW CRM: Google Drive integration
--
-- One shared Google account connects per BMW CRM account (admin
-- connects it once, in Workspace → Google Drive — same model as
-- WhatsApp config, not a per-user connection). Tokens encrypted
-- with the same AES-256-GCM helper already used for WhatsApp/AI
-- tokens (src/lib/whatsapp/encryption.ts) — no second encryption
-- scheme introduced for this.
--
-- `drive_files` is BMW CRM's own record of files IT created via the
-- Drive API (New Doc / New Sheet buttons) — not a mirror of the
-- whole connected Drive. That's a deliberate consequence of using
-- the `drive.file` OAuth scope: the app can only see/manage files it
-- itself created, so there is nothing else to list even if we
-- wanted to. Each row optionally links to a project or a client,
-- so a Doc/Sheet shows up right on that record's Files area.
--
-- Uses gen_random_uuid() (built into Postgres core since v13, no
-- extension required) rather than this project's original
-- uuid_generate_v4() (from the uuid-ossp extension) — same fix as
-- 052_client_payments.sql, for the same reason: uuid_generate_v4()
-- has repeatedly failed with "does not exist" on this database even
-- with a defensive CREATE EXTENSION, most likely a search_path issue
-- rather than a genuinely missing extension. Sidestepping it
-- entirely is more reliable than continuing to chase that.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS google_drive_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  connected_email TEXT,
  -- Encrypted with src/lib/whatsapp/encryption.ts's encrypt()/decrypt()
  -- (AES-256-GCM, ENCRYPTION_KEY env var) — same helper, not a new one.
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE google_drive_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage google drive config" ON google_drive_config;
CREATE POLICY "Admins can manage google drive config" ON google_drive_config FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON google_drive_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON google_drive_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DRIVE_FILES — Docs/Sheets BMW CRM created via the Drive API,
-- optionally tied to a project or a client (never both).
-- ============================================================
CREATE TABLE IF NOT EXISTS drive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('doc', 'sheet')),
  web_view_link TEXT NOT NULL,
  icon_link TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (project_id IS NULL OR client_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_drive_files_account ON drive_files(account_id);
CREATE INDEX IF NOT EXISTS idx_drive_files_project ON drive_files(project_id);
CREATE INDEX IF NOT EXISTS idx_drive_files_client ON drive_files(client_id);

ALTER TABLE drive_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read drive files" ON drive_files;
CREATE POLICY "Viewers can read drive files" ON drive_files FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can manage drive files" ON drive_files;
CREATE POLICY "Agents can manage drive files" ON drive_files FOR ALL
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'))