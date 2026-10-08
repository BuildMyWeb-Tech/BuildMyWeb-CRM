-- ============================================================
-- 103_seed_missing_daily_tasks_pipeline.sql
-- Seed a "Daily Tasks" pipeline for any account that was created
-- after migration 050 ran and therefore never got one.
-- Idempotent — skips accounts that already have one.
-- ============================================================

DO $$
DECLARE
  acct RECORD;
  new_pipeline_id UUID;
BEGIN
  FOR acct IN SELECT id, owner_user_id FROM accounts LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pipelines WHERE account_id = acct.id AND name = 'Daily Tasks'
    ) THEN
      INSERT INTO pipelines (account_id, user_id, name)
      VALUES (acct.id, acct.owner_user_id, 'Daily Tasks')
      RETURNING id INTO new_pipeline_id;

      INSERT INTO pipeline_stages (pipeline_id, name, position, color) VALUES
        (new_pipeline_id, 'To Do',       0, '#94a3b8'),
        (new_pipeline_id, 'In Progress', 1, '#facc15'),
        (new_pipeline_id, 'Review',      2, '#60a5fa'),
        (new_pipeline_id, 'Done',        3, '#22c55e');
    END IF;
  END LOOP;
END $$;
