-- ============================================================
-- 054_user_management.sql — BMW CRM: local username accounts +
-- per-page CRUD permissions
--
-- Two additions, both requested off a reference screenshot from a
-- different (manufacturing/ERP) app:
--
-- 1. Local username accounts. Supabase Auth requires an email under
--    the hood — there's no way around that at the platform level —
--    so a "username-only" account synthesizes an internal email
--    (username@bmwcrm.internal, see /api/users route) that the user
--    never sees or uses. `profiles.username` is the real, user-
--    facing identifier; `profiles.email` still holds the synthetic
--    one Supabase Auth actually uses. This only works cleanly
--    because BMW CRM is a single private workspace, not a public
--    multi-tenant product — usernames are unique per this whole
--    deployment, not scoped per account. If this codebase is ever
--    used for more than one separate customer account, that
--    uniqueness assumption would need revisiting.
--
-- 2. `user_page_permissions` — a granular Create/Read/Update/Delete/
--    Print grid per page, per user (see src/lib/permissions/
--    page-registry.ts for the page list). IMPORTANT scope note:
--    this migration only adds the ability to STORE and READ these
--    grants. Actual enforcement, as shipped, is at the sidebar
--    level only (hide a nav link if can_read is explicitly false)
--    — existing API routes still enforce the original coarse
--    account_role (owner/admin/agent/employee/viewer), not this
--    table. Wiring this into every route as the real backend gate
--    is real, separate future work, not done here — a user with
--    only 'employee' role can't actually perform actions this grid
--    might suggest they can, regardless of what's checked here,
--    until that follow-up happens.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username
  ON profiles(username) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_page_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_update BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_print BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, page_key)
);

CREATE INDEX IF NOT EXISTS idx_user_page_permissions_account ON user_page_permissions(account_id);
CREATE INDEX IF NOT EXISTS idx_user_page_permissions_user ON user_page_permissions(user_id);

ALTER TABLE user_page_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own permissions" ON user_page_permissions;
CREATE POLICY "Users can read their own permissions" ON user_page_permissions FOR SELECT
  USING (user_id = auth.uid() OR is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS "Admins can manage user permissions" ON user_page_permissions;
CREATE POLICY "Admins can manage user permissions" ON user_page_permissions FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON user_page_permissions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_page_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
