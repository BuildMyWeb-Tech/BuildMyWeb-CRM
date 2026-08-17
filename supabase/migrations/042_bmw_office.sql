-- ============================================================
-- 043_bmw_office.sql — BMW CRM Phase 4: BMW Office
--
-- Two pieces:
--
-- 1. office_access — the checkbox. A row here grants a non-admin
--    account member VIEW access to Office (its file tree from
--    042_file_manager.sql, plus Company Info below). Admins always
--    have full access regardless of this table; this only ever
--    ADDS reach for non-admins, it never restricts an admin.
--    Editing (uploads, company info edits) stays admin-only even
--    for a member with office_access — this grants viewing, not
--    editing. Loosen that later if you decide non-admins should be
--    able to edit too.
--
-- 2. company_info_fields / company_info_values — a small EAV pair
--    mirroring the app's existing custom_fields/contact_custom_values
--    pattern (001_initial_schema.sql) rather than a fixed-column
--    table, since BMW wants admin-defined field names with a
--    required/optional flag, not a hardcoded form. Starts empty —
--    no fields are seeded; the first thing an admin does on this
--    page is add their own.
--
-- Bills are NOT a separate table by design — they're just PDFs in
-- the Phase 3 File Manager (e.g. a "Bills" folder you create
-- yourself under Office). Keeping that as plain files avoided
-- building a second, redundant upload system.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- OFFICE_ACCESS
-- ============================================================
CREATE TABLE IF NOT EXISTS office_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id)
);

ALTER TABLE office_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage office access" ON office_access;
CREATE POLICY "Admins can manage office access" ON office_access FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- A member can see their OWN grant row (so the UI can tell them
-- they have access) without being able to see the whole roster of
-- who else has it — that stays admin-only, above.
DROP POLICY IF EXISTS "Members can see their own office access" ON office_access;
CREATE POLICY "Members can see their own office access" ON office_access FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- has_office_access() — admin, OR an explicit grant row.
-- Used by Office-scoped rows in file_folders/files (updated below)
-- and by company_info_fields/company_info_values.
-- ============================================================
CREATE OR REPLACE FUNCTION has_office_access(target_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_account_member(target_account_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM office_access
      WHERE account_id = target_account_id AND user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION has_office_access(UUID) TO authenticated, service_role;

-- ============================================================
-- Widen Phase 3's Office-scoped SELECT policies from admin-only to
-- has_office_access() now that the checkbox exists. The manage
-- (INSERT/UPDATE/DELETE) policies are untouched — editing Office
-- files stays admin-only, see the note at the top of this file.
-- ============================================================
DROP POLICY IF EXISTS "Viewers can read project folders" ON file_folders;
CREATE POLICY "Viewers can read project folders" ON file_folders FOR SELECT
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (project_id IS NULL AND has_office_access(account_id))
  );

DROP POLICY IF EXISTS "Viewers can read project files" ON files;
CREATE POLICY "Viewers can read project files" ON files FOR SELECT
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (project_id IS NULL AND has_office_access(account_id))
  );

-- Storage bucket SELECT policy from 042 already floors at
-- account-viewer, which is looser than has_office_access() — an
-- account viewer without an office_access grant still can't
-- discover an Office file's storage_path (blocked by the `files`
-- table policy above), so there is nothing for the looser bucket
-- policy to actually expose. No change needed there.

-- ============================================================
-- COMPANY_INFO_FIELDS — admin-defined field list
-- ============================================================
CREATE TABLE IF NOT EXISTS company_info_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_info_fields_account ON company_info_fields(account_id);

ALTER TABLE company_info_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office access can read company fields" ON company_info_fields;
CREATE POLICY "Office access can read company fields" ON company_info_fields FOR SELECT
  USING (has_office_access(account_id));

DROP POLICY IF EXISTS "Admins can manage company fields" ON company_info_fields;
CREATE POLICY "Admins can manage company fields" ON company_info_fields FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ============================================================
-- COMPANY_INFO_VALUES — one value per field, per account
-- ============================================================
CREATE TABLE IF NOT EXISTS company_info_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES company_info_fields(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (account_id, field_id)
);

ALTER TABLE company_info_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office access can read company values" ON company_info_values;
CREATE POLICY "Office access can read company values" ON company_info_values FOR SELECT
  USING (has_office_access(account_id));

DROP POLICY IF EXISTS "Admins can manage company values" ON company_info_values;
CREATE POLICY "Admins can manage company values" ON company_info_values FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON company_info_values;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON company_info_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();