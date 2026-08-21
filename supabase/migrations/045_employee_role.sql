-- ============================================================
-- 044_employee_role.sql — BMW CRM: add the "employee" role
--
-- Read + Update only, no Create/Delete — sits between viewer and
-- agent in the hierarchy. This migration ONLY adds the enum value.
-- The ranking used by is_account_member() (and its TypeScript
-- mirror in src/lib/auth/roles.ts) is updated in the next migration
-- (045) — Postgres does not allow a newly added enum value to be
-- used in the same transaction that added it, so these must stay
-- two separate migration files.
--
-- Idempotent — ADD VALUE IF NOT EXISTS is safe to re-run.
-- ============================================================

ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'employee';
