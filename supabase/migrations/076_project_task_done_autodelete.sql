-- Migration 076: Auto-delete project tasks 24 hours after their stage is set to "done"
--
-- Approach: add a `done_at` column to project_tasks that is populated
-- by a trigger when the associated pipeline_stage has name = 'done'
-- (case-insensitive). A separate pg_cron job (or the app's scheduled
-- API call) can then DELETE rows where done_at < now() - interval '24h'.
--
-- We also expose a cleanup RPC that the app can call on a schedule
-- (e.g. from a Next.js route handler cron) without needing pg_cron.

-- ── 1. Add done_at column ─────────────────────────────────────────────────────

ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_project_tasks_done_at
  ON project_tasks(done_at)
  WHERE done_at IS NOT NULL;

-- ── 2. Trigger: set done_at when stage becomes "done" ─────────────────────────

CREATE OR REPLACE FUNCTION set_project_task_done_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_stage_name TEXT;
BEGIN
  -- Only act when stage_id changes.
  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  IF NEW.stage_id IS NULL THEN
    -- Stage cleared — clear done_at too.
    NEW.done_at := NULL;
    RETURN NEW;
  END IF;

  SELECT name INTO v_stage_name
    FROM pipeline_stages
   WHERE id = NEW.stage_id;

  IF lower(v_stage_name) = 'done' THEN
    -- Only stamp done_at the first time the task enters a "done" stage.
    IF OLD.done_at IS NULL THEN
      NEW.done_at := now();
    END IF;
  ELSE
    -- Moved out of "done" — clear the timestamp so the clock resets.
    NEW.done_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_task_done_at ON project_tasks;
CREATE TRIGGER trg_project_task_done_at
  BEFORE UPDATE ON project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_project_task_done_at();

-- ── 3. Cleanup RPC — call this on a schedule to delete expired tasks ──────────

CREATE OR REPLACE FUNCTION delete_done_project_tasks(hours_old INTEGER DEFAULT 24)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM project_tasks
   WHERE done_at IS NOT NULL
     AND done_at < now() - (hours_old || ' hours')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Allow any authenticated member to call the cleanup (server-side API route
-- will verify the caller has at least the agent role before invoking it).
REVOKE ALL ON FUNCTION delete_done_project_tasks(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_done_project_tasks(INTEGER) TO authenticated;
