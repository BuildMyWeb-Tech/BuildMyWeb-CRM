-- ============================================================
-- 065_unify_project_client_status.sql — BMW CRM: Project status now
-- uses the exact same vocabulary as Client status (active / inactive
-- / archived), instead of its own separate active / on_hold /
-- completed / cancelled set.
--
-- This is what makes "Client Directory and Projects must be
-- interlinked" actually mean something simple: a client's status IS
-- a project's status now, not two different scales that need a
-- lookup table to translate between (058_client_leads.sql's
-- confirm-a-lead-into-a-client flow and the client PATCH cascade
-- both get simpler because of this — see clients/route.ts and
-- clients/[id]/route.ts).
--
-- Mapping existing rows: on_hold -> inactive, completed/cancelled ->
-- archived (both were "this project isn't ongoing work anymore",
-- which is what archived means on the client side too).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

UPDATE projects SET status = 'inactive' WHERE status = 'on_hold';
UPDATE projects SET status = 'archived' WHERE status IN ('completed', 'cancelled');

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));
