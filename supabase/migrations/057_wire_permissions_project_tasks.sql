-- ============================================================
-- 057_wire_permissions_project_tasks.sql — BMW CRM: extend the
-- granular CRUD grid (has_page_permission, from
-- 055_page_permission_enforcement.sql) to the table that actually
-- backs Daily Tasks and Kanban today.
--
-- 055 wired has_page_permission() into `daily_tasks`, `kanban_boards`
-- and `kanban_cards` — but the app moved on since then: Daily Tasks
-- (src/app/(dashboard)/daily-tasks/page.tsx) and the global Kanban
-- board (src/app/(dashboard)/kanban/page.tsx, see
-- 056_common_kanban.sql) both read/write `project_tasks` directly
-- from the browser's RLS-scoped client. The old tables' policies
-- from 055 are dead code — nothing in the live UI touches them
-- anymore — which is why the permission checkboxes for these two
-- pages had no effect. This migration is the fix: split
-- project_tasks' single "Agents can manage tasks FOR ALL" policy
-- (041_client_projects.sql) into per-action policies gated the same
-- way 055 gates everything else.
--
-- A task row is shared between both pages, so a single mutation
-- can't know "which page did this write come from" — gated as
-- "permitted from EITHER page" (OR, not AND): a caller blocked by an
-- explicit deny row on BOTH daily_tasks and kanban is blocked
-- everywhere; a caller with only one of the two pages assigned still
-- works from that page. Same non-restrictive default as everywhere
-- else: no explicit row for a page always passes for that page.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DROP POLICY IF EXISTS "Agents can manage tasks" ON project_tasks;

DROP POLICY IF EXISTS "Agents can create tasks" ON project_tasks;
CREATE POLICY "Agents can create tasks" ON project_tasks FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (
      has_page_permission(account_id, 'daily_tasks', 'create')
      OR has_page_permission(account_id, 'kanban', 'create')
    )
  );

DROP POLICY IF EXISTS "Agents can update tasks" ON project_tasks;
CREATE POLICY "Agents can update tasks" ON project_tasks FOR UPDATE
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND (
      has_page_permission(account_id, 'daily_tasks', 'update')
      OR has_page_permission(account_id, 'kanban', 'update')
    )
  );

DROP POLICY IF EXISTS "Agents can delete tasks" ON project_tasks;
CREATE POLICY "Agents can delete tasks" ON project_tasks FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND (
      has_page_permission(account_id, 'daily_tasks', 'delete')
      OR has_page_permission(account_id, 'kanban', 'delete')
    )
  );

-- Note: kanban_common_statuses (board columns themselves, from
-- 056_common_kanban.sql) is deliberately left untouched — its base
-- policy is already admin-only ("Admins can manage common kanban
-- statuses" FOR ALL), and has_page_permission() always returns TRUE
-- for admin/owner, so AND-ing it in here would be a no-op, same
-- reasoning 055 documented for the Accounts table. Column
-- management isn't part of what the CRUD grid needs to gate — only
-- the tasks inside the columns are.
