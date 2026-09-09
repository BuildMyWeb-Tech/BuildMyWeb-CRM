-- ============================================================
-- 067_followup_multi_assignee_activity_log.sql
--
-- Three independent additions, bundled because they shipped together:
--
-- 1. client_leads.next_follow_up_has_time — a follow-up can now be
--    booked as a bare date (no clock time). FALSE means "date only":
--    the UI hides the time-of-day and overdue/today comparisons use
--    calendar-day granularity instead of exact timestamps.
--
-- 2. Multi-assignee — client_leads/project_tasks/daily_tasks each
--    gain a `..._user_ids UUID[]` column alongside their existing
--    singular `allocated_user_id`/`assignee_user_id` column (kept,
--    not dropped — the cron job and any other single-assignee reader
--    keeps working unchanged, treating array[0] as "primary").
--    Backfilled from the existing singular column so nobody's current
--    assignment disappears.
--
-- 3. activity_logs — login/logout (with session_id pairing so a
--    logout row can be matched back to its login row to compute
--    session duration) plus create/update/delete events for a few
--    high-traffic entities. Every account member can INSERT their own
--    rows (user_id = auth.uid()) since this is written from the
--    client the moment it happens; only viewers+ can read.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE client_leads ADD COLUMN IF NOT EXISTS next_follow_up_has_time BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE client_leads ADD COLUMN IF NOT EXISTS allocated_user_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS assignee_user_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS assignee_user_ids UUID[] NOT NULL DEFAULT '{}';

UPDATE client_leads SET allocated_user_ids = ARRAY[allocated_user_id]
  WHERE allocated_user_id IS NOT NULL AND allocated_user_ids = '{}';
UPDATE project_tasks SET assignee_user_ids = ARRAY[assignee_user_id]
  WHERE assignee_user_id IS NOT NULL AND assignee_user_ids = '{}';
UPDATE daily_tasks SET assignee_user_ids = ARRAY[assignee_user_id]
  WHERE assignee_user_id IS NOT NULL AND assignee_user_ids = '{}';

CREATE INDEX IF NOT EXISTS idx_client_leads_allocated_ids ON client_leads USING GIN (allocated_user_ids);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee_ids ON project_tasks USING GIN (assignee_user_ids);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_assignee_ids ON daily_tasks USING GIN (assignee_user_ids);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('login', 'logout', 'create', 'update', 'delete')),
  entity_type TEXT,
  entity_id UUID,
  description TEXT NOT NULL,
  -- Ties a 'logout' row back to its 'login' row so the Activity Log
  -- page can compute session duration (logout.created_at - login.created_at).
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_account ON activity_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_session ON activity_logs(session_id);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read activity logs" ON activity_logs;
CREATE POLICY "Viewers can read activity logs" ON activity_logs FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

-- Written client-side the instant an event happens (sign-in, sign-out,
-- a save) — every member can log, but only as themselves.
DROP POLICY IF EXISTS "Members can log their own activity" ON activity_logs;
CREATE POLICY "Members can log their own activity" ON activity_logs FOR INSERT
  WITH CHECK (is_account_member(account_id, 'viewer') AND (user_id IS NULL OR user_id = auth.uid()));
