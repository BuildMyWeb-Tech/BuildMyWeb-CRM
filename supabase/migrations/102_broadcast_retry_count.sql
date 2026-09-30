-- Migration 102: Add retry_count to broadcasts table
-- Tracks how many times a failed broadcast has been retried (max 5).

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
