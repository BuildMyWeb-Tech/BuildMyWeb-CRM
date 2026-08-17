-- ============================================================
-- 043_module_access.sql — BMW CRM Phase 4: per-module permissions
-- (OPTIONAL — only needed once you have a teammate whose role
-- shouldn't map 1:1 across all 3 modules, e.g. a sales agent who
-- must NOT see bills. Skip this migration entirely if it's just
-- you, or if account_role alone is fine for now.)
--
-- Adds a account_role x module -> access_level matrix. Falls back
-- to account_role's existing behaviour when no row exists for a
-- given (account, role, module) combination, so this is additive,
-- not a breaking change to 040-042's policies (those still stand
-- as the floor; this can only tighten Office further per-role).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS module_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role account_role_enum NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('sales', 'projects', 'office')),
  access_level TEXT NOT NULL DEFAULT 'edit' CHECK (access_level IN ('none', 'view', 'edit')),
  UNIQUE (account_id, role, module)
);

ALTER TABLE module_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read module access" ON module_access;
CREATE POLICY "Viewers can read module access" ON module_access FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage module access" ON module_access;
CREATE POLICY "Admins can manage module access" ON module_access FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- Helper: resolve effective access, falling back to the existing
-- account_role floor (viewer=view, agent+=edit) when unconfigured.
CREATE OR REPLACE FUNCTION has_module_access(
  target_account_id UUID,
  target_module TEXT,
  min_level TEXT DEFAULT 'view'
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role account_role_enum;
  configured_level TEXT;
  effective_level TEXT;
BEGIN
  SELECT p.account_role INTO caller_role
  FROM profiles p
  WHERE p.user_id = auth.uid() AND p.account_id = target_account_id;

  IF caller_role IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT ma.access_level INTO configured_level
  FROM module_access ma
  WHERE ma.account_id = target_account_id AND ma.role = caller_role AND ma.module = target_module;

  effective_level := COALESCE(
    configured_level,
    CASE WHEN caller_role IN ('owner', 'admin', 'agent') THEN 'edit' ELSE 'view' END
  );

  RETURN CASE
    WHEN min_level = 'view' THEN effective_level IN ('view', 'edit')
    WHEN min_level = 'edit' THEN effective_level = 'edit'
    ELSE FALSE
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION has_module_access(UUID, TEXT, TEXT) TO authenticated, service_role;

-- Seed a sensible default once a first non-owner teammate exists:
-- agents get 'edit' on sales/projects but only 'view' on office.
-- Uncomment and run manually per account when you're ready to
-- tighten this — left commented so this migration stays a no-op
-- on your solo setup until you choose to opt in.
--
-- INSERT INTO module_access (account_id, role, module, access_level)
-- VALUES ('<your-account-id>', 'agent', 'office', 'view')
-- ON CONFLICT (account_id, role, module) DO UPDATE SET access_level = EXCLUDED.access_level;
