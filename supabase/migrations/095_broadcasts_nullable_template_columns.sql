-- ============================================================
-- Migration 095: Make template_name and template_language nullable
--
-- These columns are Meta-only. QR broadcasts don't use templates
-- so they must be allowed to be NULL.
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE broadcasts
  ALTER COLUMN template_name DROP NOT NULL;

ALTER TABLE broadcasts
  ALTER COLUMN template_language DROP NOT NULL;
