-- Remove duplicate projects per (account_id, client_id): keep the oldest row.
-- Duplicate rows are created by a backfill race condition in GET /api/projects.
DELETE FROM projects
WHERE id NOT IN (
  SELECT DISTINCT ON (account_id, client_id) id
  FROM projects
  WHERE client_id IS NOT NULL
  ORDER BY account_id, client_id, created_at ASC
)
AND client_id IS NOT NULL;

-- Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS projects_account_client_unique
  ON projects (account_id, client_id)
  WHERE client_id IS NOT NULL;
