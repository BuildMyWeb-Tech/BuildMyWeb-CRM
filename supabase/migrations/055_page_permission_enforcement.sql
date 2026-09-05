-- ============================================================
-- 055_page_permission_enforcement.sql — BMW CRM: make the granular
-- CRUD grid (Office → User Management) actually enforce something
--
-- 054_user_management.sql built the STORAGE for this (the
-- user_page_permissions table) and said plainly it wasn't wired
-- into anything yet — only the sidebar read from it. This migration
-- is that wiring, done at the RLS layer rather than only in
-- Next.js API routes, because several of the features this grid
-- covers (Daily Tasks, Kanban cards, Client custom field values)
-- write directly from the browser via the RLS-scoped Supabase
-- client — there's no API route in the middle to check anything in.
-- RLS is the only place a check here can't be bypassed.
--
-- has_page_permission(account_id, page_key, action) returns:
--   TRUE  — if the caller is admin/owner (the grid never restricts
--           the people who manage it — that would be a footgun,
--           not a feature)
--   TRUE  — if the caller has NO explicit row for this page (the
--           default for every pre-existing user, and for admins'
--           own accounts before anyone touches User Management) —
--           i.e. "not additionally restricted", falls through to
--           whatever the existing is_account_member() check already
--           requires
--   the actual can_create/can_read/can_update/can_delete value —
--           if the caller DOES have an explicit row for this page,
--           for a non-admin role
--
-- This is additive to every policy it's wired into (AND'd with the
-- existing is_account_member() check), never a replacement for it —
-- a viewer with can_create:true on some page still can't create
-- anything there, because the existing role check still requires
-- 'agent' first. The grid can only take away access an existing
-- role already grants, never hand out more.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE OR REPLACE FUNCTION has_page_permission(
  target_account_id UUID,
  target_page_key TEXT,
  target_action TEXT -- 'create' | 'read' | 'update' | 'delete' | 'print'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN is_account_member(target_account_id, 'admin') THEN TRUE
    WHEN NOT EXISTS (
      SELECT 1 FROM user_page_permissions upp
      WHERE upp.user_id = auth.uid()
        AND upp.account_id = target_account_id
        AND upp.page_key = target_page_key
    ) THEN TRUE
    ELSE (
      SELECT CASE target_action
        WHEN 'create' THEN can_create
        WHEN 'read'   THEN can_read
        WHEN 'update' THEN can_update
        WHEN 'delete' THEN can_delete
        WHEN 'print'  THEN can_print
        ELSE FALSE
      END
      FROM user_page_permissions
      WHERE user_id = auth.uid()
        AND account_id = target_account_id
        AND page_key = target_page_key
    )
  END;
$$;

ALTER FUNCTION has_page_permission(UUID, TEXT, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION has_page_permission(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================
-- Wire it into RLS for the modules the permission grid actually
-- covers — Client Directory, Daily Tasks, Kanban, Accounts. Not
-- every table in the app: the legacy WACRM modules (contacts,
-- deals, broadcasts, automations, flows, AI config) are left
-- untouched here — those have their own long-tested RLS this
-- migration isn't confident enough to safely touch without a much
-- more careful, separate pass. Projects/Company Details/User
-- Management/Files aren't included either in this first pass — say
-- the word to extend this to more pages, same pattern each time.
-- ============================================================

-- --- Client Directory (clients, scope_of_work) ---
DROP POLICY IF EXISTS "Agents can create and delete clients" ON clients;
CREATE POLICY "Agents can create and delete clients" ON clients FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'client_directory', 'create'));

DROP POLICY IF EXISTS "Agents can delete clients" ON clients;
CREATE POLICY "Agents can delete clients" ON clients FOR DELETE
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'client_directory', 'delete'));

DROP POLICY IF EXISTS "Employees can update clients" ON clients;
CREATE POLICY "Employees can update clients" ON clients FOR UPDATE
  USING (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'client_directory', 'update'))
  WITH CHECK (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'client_directory', 'update'));

DROP POLICY IF EXISTS "Agents can create scope of work" ON scope_of_work;
CREATE POLICY "Agents can create scope of work" ON scope_of_work FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'client_directory', 'create'));

DROP POLICY IF EXISTS "Agents can delete scope of work" ON scope_of_work;
CREATE POLICY "Agents can delete scope of work" ON scope_of_work FOR DELETE
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'client_directory', 'delete'));

DROP POLICY IF EXISTS "Employees can update scope of work" ON scope_of_work;
CREATE POLICY "Employees can update scope of work" ON scope_of_work FOR UPDATE
  USING (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'client_directory', 'update'))
  WITH CHECK (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'client_directory', 'update'));

-- --- Daily Tasks ---
DROP POLICY IF EXISTS "Agents can create daily tasks" ON daily_tasks;
CREATE POLICY "Agents can create daily tasks" ON daily_tasks FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'daily_tasks', 'create'));

DROP POLICY IF EXISTS "Agents can delete daily tasks" ON daily_tasks;
CREATE POLICY "Agents can delete daily tasks" ON daily_tasks FOR DELETE
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'daily_tasks', 'delete'));

DROP POLICY IF EXISTS "Employees can update daily tasks" ON daily_tasks;
CREATE POLICY "Employees can update daily tasks" ON daily_tasks FOR UPDATE
  USING (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'daily_tasks', 'update'))
  WITH CHECK (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'daily_tasks', 'update'));

-- --- Kanban (boards + cards) ---
DROP POLICY IF EXISTS "Agents can create kanban boards" ON kanban_boards;
CREATE POLICY "Agents can create kanban boards" ON kanban_boards FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'kanban', 'create'));

DROP POLICY IF EXISTS "Agents can delete kanban boards" ON kanban_boards;
CREATE POLICY "Agents can delete kanban boards" ON kanban_boards FOR DELETE
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'kanban', 'delete'));

DROP POLICY IF EXISTS "Employees can update kanban boards" ON kanban_boards;
CREATE POLICY "Employees can update kanban boards" ON kanban_boards FOR UPDATE
  USING (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'kanban', 'update'))
  WITH CHECK (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'kanban', 'update'));

DROP POLICY IF EXISTS "Agents can create kanban cards" ON kanban_cards;
CREATE POLICY "Agents can create kanban cards" ON kanban_cards FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'kanban', 'create'));

DROP POLICY IF EXISTS "Agents can delete kanban cards" ON kanban_cards;
CREATE POLICY "Agents can delete kanban cards" ON kanban_cards FOR DELETE
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'kanban', 'delete'));

DROP POLICY IF EXISTS "Employees can update kanban cards" ON kanban_cards;
CREATE POLICY "Employees can update kanban cards" ON kanban_cards FOR UPDATE
  USING (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'kanban', 'update'))
  WITH CHECK (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'kanban', 'update'));

-- --- Accounts (client payments + allocations) — deliberately NOT
-- wired here. 052_client_payments.sql made this admin-only for
-- every operation, including read, given it's compensation/revenue
-- data — is_account_member(account_id, 'admin') already gates it
-- completely, so AND'ing has_page_permission() in would be a no-op
-- (admins always pass that check unconditionally) unless this
-- table's base policy is deliberately loosened below admin-only
-- first. Not doing that silently as a side effect of this
-- migration — say so explicitly if non-admin access to Accounts via
-- the grid is actually wanted, and this is a one-policy change away.
