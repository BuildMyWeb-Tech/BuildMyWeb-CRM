-- ============================================================
-- 069_normalize_daily_tasks_and_common_stages.sql
--
-- 068 normalized every PROJECT's own board stages (pipeline_stages
-- reached via `projects.pipeline_id`) to one 6-stage set: To Do, In
-- Progress, Hold, Waiting on Client, Review, Done. It missed the
-- Daily Tasks pipeline (one per account, seeded by
-- 050_daily_tasks.sql with its own separate 4-stage set: To Do,
-- Ongoing, Review, Complete) — that pipeline isn't reachable via any
-- `projects` row, so 068's `SELECT DISTINCT pipeline_id FROM
-- projects` loop never touched it. Result: the Project Tasks /
-- Overview table (which merges daily_tasks rows and project_tasks
-- rows into one list) showed both vocabularies side by side —
-- "Ongoing" from Daily Tasks next to "In Progress" from every
-- project — read as a duplicate-stage bug. Same fix, same merge
-- logic, applied to the one Daily Tasks pipeline per account instead
-- of per-project.
--
-- Also brings kanban_common_statuses (the separate cross-project
-- Kanban taxonomy, only ever seeded with 4 names) up to the same
-- 6-name set, for the same "one uniform set of stages" goal —
-- additive only, nothing merges since it never had a stray name.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DO $$
DECLARE
  pl RECORD;
  ongoing_stage RECORD;
  in_progress_stage RECORD;
  complete_stage RECORD;
  done_stage RECORD;
  max_pos INTEGER;
BEGIN
  FOR pl IN SELECT id, account_id FROM pipelines WHERE name = 'Daily Tasks' LOOP
    -- Ongoing -> In Progress
    SELECT * INTO ongoing_stage FROM pipeline_stages
      WHERE pipeline_id = pl.id AND name ILIKE 'ongoing' LIMIT 1;
    IF FOUND THEN
      SELECT * INTO in_progress_stage FROM pipeline_stages
        WHERE pipeline_id = pl.id AND name ILIKE 'in progress' LIMIT 1;
      IF NOT FOUND THEN
        UPDATE pipeline_stages SET name = 'In Progress' WHERE id = ongoing_stage.id;
      ELSE
        UPDATE daily_tasks SET stage_id = in_progress_stage.id WHERE stage_id = ongoing_stage.id;
        DELETE FROM pipeline_stages WHERE id = ongoing_stage.id;
      END IF;
    END IF;

    -- Complete -> Done
    SELECT * INTO complete_stage FROM pipeline_stages
      WHERE pipeline_id = pl.id AND name ILIKE 'complete' LIMIT 1;
    IF FOUND THEN
      SELECT * INTO done_stage FROM pipeline_stages
        WHERE pipeline_id = pl.id AND name ILIKE 'done' LIMIT 1;
      IF NOT FOUND THEN
        UPDATE pipeline_stages SET name = 'Done' WHERE id = complete_stage.id;
      ELSE
        UPDATE daily_tasks SET stage_id = done_stage.id WHERE stage_id = complete_stage.id;
        DELETE FROM pipeline_stages WHERE id = complete_stage.id;
      END IF;
    END IF;

    SELECT COALESCE(MAX(position), 0) INTO max_pos FROM pipeline_stages WHERE pipeline_id = pl.id;

    IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE pipeline_id = pl.id AND name ILIKE 'hold') THEN
      max_pos := max_pos + 1;
      INSERT INTO pipeline_stages (pipeline_id, name, position, color)
      VALUES (pl.id, 'Hold', max_pos, '#f59e0b');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE pipeline_id = pl.id AND name ILIKE 'waiting on client') THEN
      max_pos := max_pos + 1;
      INSERT INTO pipeline_stages (pipeline_id, name, position, color)
      VALUES (pl.id, 'Waiting on Client', max_pos, '#a855f7');
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- kanban_common_statuses — add Hold / Waiting on Client wherever
-- missing, same colors as the pipeline_stages version above.
-- ============================================================
DO $$
DECLARE
  acct RECORD;
  max_pos INTEGER;
BEGIN
  FOR acct IN SELECT id FROM accounts LOOP
    SELECT COALESCE(MAX(position), 0) INTO max_pos FROM kanban_common_statuses WHERE account_id = acct.id;
    IF max_pos = 0 THEN CONTINUE; END IF; -- no common-status taxonomy seeded for this account yet

    IF NOT EXISTS (SELECT 1 FROM kanban_common_statuses WHERE account_id = acct.id AND name ILIKE 'hold') THEN
      max_pos := max_pos + 1;
      INSERT INTO kanban_common_statuses (account_id, name, color, position)
      VALUES (acct.id, 'Hold', '#f59e0b', max_pos);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM kanban_common_statuses WHERE account_id = acct.id AND name ILIKE 'waiting on client') THEN
      max_pos := max_pos + 1;
      INSERT INTO kanban_common_statuses (account_id, name, color, position)
      VALUES (acct.id, 'Waiting on Client', '#a855f7', max_pos);
    END IF;
  END LOOP;
END $$;
