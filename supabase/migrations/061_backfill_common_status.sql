-- ============================================================
-- 061_backfill_common_status.sql — BMW CRM: fix already-created
-- project_tasks that landed in the wrong column on the unified
-- Kanban board
--
-- Every project task's common_status_id has been left NULL since
-- 056_common_kanban.sql shipped, because neither
-- POST /api/projects/[id]/tasks nor PATCH /api/tasks/[id] ever set
-- it (see src/lib/kanban/resolve-common-status.ts, added alongside
-- this migration, which is the actual fix for new/edited tasks).
-- A NULL common_status_id always renders in the unified board's
-- FIRST column regardless of the task's real stage — e.g. two tasks
-- created under "In Progress" on a project's own board showed up
-- under "To Do" on /kanban.
--
-- This is the one-time catch-up for tasks that already exist:
-- resolve each affected task's real column by matching its pipeline
-- stage's name to a same-named kanban_common_statuses row for its
-- account (case-insensitive) — the exact same rule
-- resolveCommonStatusId() uses going forward.
--
-- "Affected" is NULL common_status_id OR already sitting in the
-- account's FIRST-position common status (056_common_kanban.sql's
-- own backfill DO block set every then-NULL row to that first status
-- outright, before this migration could apply the name-matching rule
-- — the two migrations landed back-to-back in the same deploy, so any
-- task created between them got the coarse fallback first). Treating
-- "sitting in the first column" as also-affected mirrors the unified
-- board's own render-time fallback (an unmapped task always shows in
-- the first column), so this never overwrites a task genuinely
-- dragged to columns 2+ — only the ones a first-column-shaped default
-- could plausibly explain. Tasks whose stage name doesn't match any
-- common status are left as-is.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

UPDATE project_tasks pt
SET common_status_id = kcs.id
FROM pipeline_stages ps
JOIN kanban_common_statuses kcs
  ON lower(trim(kcs.name)) = lower(trim(ps.name))
WHERE pt.stage_id = ps.id
  AND kcs.account_id = pt.account_id
  AND (
    pt.common_status_id IS NULL
    OR pt.common_status_id IN (
      SELECT id FROM kanban_common_statuses
      WHERE account_id = pt.account_id
      ORDER BY position ASC
      LIMIT 1
    )
  );
