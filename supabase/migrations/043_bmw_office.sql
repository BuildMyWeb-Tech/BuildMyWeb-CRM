-- ============================================================
-- 042_bmw_office.sql — BMW CRM Phase 4: BMW Office
--
-- This migration creates:
--
-- 1. office_access
--    Grants non-admin account members access to the BMW Office.
--
-- 2. has_office_access()
--    Helper function used by Office-related RLS policies.
--
-- 3. company_info_fields
--    Admin-defined company information fields.
--
-- 4. company_info_values
--    Values stored against those fields.
--
-- IMPORTANT:
-- This migration intentionally DOES NOT reference file_folders,
-- files, or storage.objects.
--
-- The File Manager is created by 044_file_manager.sql.
-- Referencing file_folders here would make migration 042 depend
-- on a later migration and cause:
--
--   ERROR: relation "file_folders" does not exist
--
-- File Manager / Office storage policies should therefore be
-- handled in 044 or in a later migration.
--
-- UUID generation:
-- Uses gen_random_uuid(), which is available in modern Supabase
-- PostgreSQL installations.
--
-- Idempotent — safe to run multiple times.
-- ============================================================


-- ============================================================
-- OFFICE_ACCESS
-- ============================================================
--
-- One row grants a member access to BMW Office.
--
-- Admins do not need a row here because admins automatically
-- have Office access through has_office_access().
--
-- Non-admin members need an explicit row.
--
-- ============================================================

CREATE TABLE IF NOT EXISTS office_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  granted_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (account_id, user_id)
);


CREATE INDEX IF NOT EXISTS idx_office_access_account
  ON office_access(account_id);


CREATE INDEX IF NOT EXISTS idx_office_access_user
  ON office_access(user_id);


ALTER TABLE office_access ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- OFFICE_ACCESS POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage office access"
  ON office_access;

CREATE POLICY "Admins can manage office access"
  ON office_access
  FOR ALL
  USING (
    is_account_member(account_id, 'admin')
  )
  WITH CHECK (
    is_account_member(account_id, 'admin')
  );


-- A member can see their own Office access row.
--
-- This allows the frontend to determine whether the current
-- user has been granted Office access without exposing the
-- complete Office-access roster to ordinary members.
--
-- Admins can already see/manage everything through the policy
-- above.

DROP POLICY IF EXISTS "Members can see their own office access"
  ON office_access;

CREATE POLICY "Members can see their own office access"
  ON office_access
  FOR SELECT
  USING (
    user_id = auth.uid()
  );


-- ============================================================
-- HAS_OFFICE_ACCESS()
-- ============================================================
--
-- Returns TRUE when:
--
-- 1. The current user is an account admin
-- OR
-- 2. The current user has an explicit office_access row
--
-- SECURITY DEFINER is intentional because this function is used
-- inside RLS policies.
--
-- ============================================================

CREATE OR REPLACE FUNCTION has_office_access(
  target_account_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_account_member(target_account_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM office_access
      WHERE office_access.account_id = target_account_id
        AND office_access.user_id = auth.uid()
    );
$$;


GRANT EXECUTE
  ON FUNCTION has_office_access(UUID)
  TO authenticated, service_role;


-- ============================================================
-- COMPANY_INFO_FIELDS
-- ============================================================
--
-- Admin-defined company information fields.
--
-- Examples:
--
-- Company Name
-- Company Registration Number
-- GST Number
-- PAN Number
-- Address
-- Phone
-- Email
-- Website
-- Founder
-- Bank Name
-- etc.
--
-- The actual fields are intentionally NOT hardcoded.
--
-- ============================================================

CREATE TABLE IF NOT EXISTS company_info_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  field_name TEXT NOT NULL,

  is_required BOOLEAN NOT NULL DEFAULT FALSE,

  position INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_company_info_fields_account
  ON company_info_fields(account_id);


ALTER TABLE company_info_fields ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- COMPANY_INFO_FIELDS SELECT
-- ============================================================

DROP POLICY IF EXISTS "Office access can read company fields"
  ON company_info_fields;

CREATE POLICY "Office access can read company fields"
  ON company_info_fields
  FOR SELECT
  USING (
    has_office_access(account_id)
  );


-- ============================================================
-- COMPANY_INFO_FIELDS ADMIN MANAGEMENT
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage company fields"
  ON company_info_fields;

CREATE POLICY "Admins can manage company fields"
  ON company_info_fields
  FOR ALL
  USING (
    is_account_member(account_id, 'admin')
  )
  WITH CHECK (
    is_account_member(account_id, 'admin')
  );


-- ============================================================
-- COMPANY_INFO_VALUES
-- ============================================================
--
-- Stores the value for each company information field.
--
-- Example:
--
-- company_info_fields:
--   "Company Name"
--
-- company_info_values:
--   "BuildMyWeb"
--
-- One value per account + field.
--
-- ============================================================

CREATE TABLE IF NOT EXISTS company_info_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  field_id UUID NOT NULL
    REFERENCES company_info_fields(id)
    ON DELETE CASCADE,

  value TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  UNIQUE (account_id, field_id)
);


CREATE INDEX IF NOT EXISTS idx_company_info_values_account
  ON company_info_values(account_id);


CREATE INDEX IF NOT EXISTS idx_company_info_values_field
  ON company_info_values(field_id);


ALTER TABLE company_info_values ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- COMPANY_INFO_VALUES SELECT
-- ============================================================

DROP POLICY IF EXISTS "Office access can read company values"
  ON company_info_values;

CREATE POLICY "Office access can read company values"
  ON company_info_values
  FOR SELECT
  USING (
    has_office_access(account_id)
  );


-- ============================================================
-- COMPANY_INFO_VALUES ADMIN MANAGEMENT
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage company values"
  ON company_info_values;

CREATE POLICY "Admins can manage company values"
  ON company_info_values
  FOR ALL
  USING (
    is_account_member(account_id, 'admin')
  )
  WITH CHECK (
    is_account_member(account_id, 'admin')
  );


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at
  ON company_info_values;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON company_info_values
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- END OF 042_bmw_office.sql
-- ============================================================