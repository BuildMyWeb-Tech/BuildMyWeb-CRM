-- Migration 102: Add 'completed' status to clients table
-- The clients CHECK constraint was created in 047 with only
-- active/inactive/archived. This adds 'completed' to match
-- projects (which got it in 096) so the cascade in PATCH
-- /api/clients/[id] can write 'completed' to both tables.
-- Idempotent — safe to run multiple times.

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_status_check
    CHECK (status IN ('active', 'inactive', 'archived', 'completed'));
