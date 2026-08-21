-- ============================================================
-- 051_projects_client_link.sql — BMW CRM: link Projects to Client
-- Directory
--
-- `projects` already had `client_contact_id` (optional link to a
-- Sales `contacts` row) and `client_name` (free text) from
-- 041_client_projects.sql — written before the Client Directory
-- module existed. This adds a THIRD, separate optional link:
-- `client_id` -> `clients(id)` (046_client_directory.sql), since a
-- project's "client" in the Client-Directory sense (the ongoing
-- relationship) is a different concept than a Sales lead contact.
-- All three stay independent and optional — a project can have any
-- combination of them set, matching the existing "not every project
-- needs a linked anything" philosophy.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
