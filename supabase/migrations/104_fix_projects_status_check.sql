-- Fix projects_status_check to allow all statuses used in the drag panel
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'inactive', 'archived', 'completed', 'hold_by_client', 'in_discussion'));
