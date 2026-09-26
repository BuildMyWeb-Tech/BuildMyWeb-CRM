-- Migration 090: Auto-delete activity_logs older than 5 days
--
-- Keeps the table lean by purging rows created more than 5 days ago.
-- A pg_cron job calls this function nightly; the function is also safe
-- to call manually for an immediate cleanup.
--
-- Note: pg_cron must be enabled on the Supabase project. If it is not,
-- the cron.schedule() call is skipped (the function still exists and
-- can be called manually or via a Supabase Edge Function cron trigger).

-- Function that deletes rows older than 5 days.
CREATE OR REPLACE FUNCTION delete_old_activity_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM activity_logs
  WHERE created_at < NOW() - INTERVAL '5 days';
$$;

-- Schedule nightly at 02:00 UTC if pg_cron is available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'delete-old-activity-logs',
      '0 2 * * *',
      'SELECT delete_old_activity_logs()'
    );
  END IF;
END;
$$;

-- Run once immediately to clean up existing old rows.
SELECT delete_old_activity_logs();
