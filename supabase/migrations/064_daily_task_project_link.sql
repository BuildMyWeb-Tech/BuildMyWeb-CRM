-- ============================================================
-- 064_daily_task_project_link.sql — BMW CRM: interlink Daily Tasks
-- with a project's own Kanban board (and, through it, the unified
-- cross-project Kanban)
--
-- Before this: picking a Project on a Daily Task only TAGGED it for
-- display/filtering (daily_tasks.project_id) — it never created a
-- matching row in `project_tasks`, so the task was invisible on that
-- project's own board and on the global Kanban (/kanban), both of
-- which only ever read `project_tasks`. Reported as "task created in
-- Daily Tasks with a project doesn't show up on either board."
--
-- Fix: when a Daily Task has a project selected, the client now
-- mirrors it into a real `project_tasks` row (see
-- daily-task-form.tsx) and remembers that row's id here, so edits
-- stay in sync and deleting/unlinking the Daily Task removes its
-- mirror instead of leaving a stale card behind.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS linked_project_task_id UUID REFERENCES project_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_tasks_linked_project_task ON daily_tasks(linked_project_task_id);
