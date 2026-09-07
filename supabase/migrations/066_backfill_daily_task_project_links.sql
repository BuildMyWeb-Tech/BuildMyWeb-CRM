-- ============================================================
-- 066_backfill_daily_task_project_links.sql — BMW CRM: catch up
-- pre-existing Daily Tasks that never got mirrored into
-- project_tasks
--
-- 064_daily_task_project_link.sql fixed the bug for NEW/edited Daily
-- Tasks going forward (daily-task-form.tsx now mirrors them), but
-- any Daily Task created before that shipped, with a project already
-- selected, still has no project_tasks row — reported as "7 daily
-- tasks show, only 4 kanban cards" (the other 3 predate the fix).
-- This is the one-time catch-up: same logic the form uses
-- (resolveCommonStatusId's name-match-or-first-column rule),
-- reimplemented in SQL since this only needs to run once against
-- existing rows, not live on every save.
--
-- Idempotent — the WHERE clause only ever touches rows still missing
-- a link, so re-running this is a no-op once caught up.
-- ============================================================

DO $$
DECLARE
  dt RECORD;
  v_pipeline_id UUID;
  v_first_stage_id UUID;
  v_first_stage_name TEXT;
  v_common_status_id UUID;
  v_position INTEGER;
  v_new_task_id UUID;
BEGIN
  FOR dt IN
    SELECT id, account_id, project_id, title, assignee_user_id, priority, target_date
    FROM daily_tasks
    WHERE project_id IS NOT NULL AND linked_project_task_id IS NULL
  LOOP
    SELECT pipeline_id INTO v_pipeline_id FROM projects WHERE id = dt.project_id;
    IF v_pipeline_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id, name INTO v_first_stage_id, v_first_stage_name
    FROM pipeline_stages
    WHERE pipeline_id = v_pipeline_id
    ORDER BY position ASC
    LIMIT 1;
    IF v_first_stage_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Name match against this account's common statuses, else first
    -- by position — identical fallback to resolveCommonStatusId().
    SELECT id INTO v_common_status_id
    FROM kanban_common_statuses
    WHERE account_id = dt.account_id AND lower(trim(name)) = lower(trim(v_first_stage_name))
    LIMIT 1;
    IF v_common_status_id IS NULL THEN
      SELECT id INTO v_common_status_id
      FROM kanban_common_statuses
      WHERE account_id = dt.account_id
      ORDER BY position ASC
      LIMIT 1;
    END IF;

    SELECT COUNT(*) INTO v_position FROM project_tasks WHERE stage_id = v_first_stage_id;

    INSERT INTO project_tasks (
      account_id, project_id, stage_id, common_status_id, title,
      assignee_user_id, priority, due_date, checklist, position
    ) VALUES (
      dt.account_id, dt.project_id, v_first_stage_id, v_common_status_id, dt.title,
      dt.assignee_user_id, dt.priority, dt.target_date, '[]'::jsonb, v_position
    )
    RETURNING id INTO v_new_task_id;

    UPDATE daily_tasks SET linked_project_task_id = v_new_task_id WHERE id = dt.id;
  END LOOP;
END $$;
