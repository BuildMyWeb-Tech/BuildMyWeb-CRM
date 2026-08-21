-- ============================================================
-- 047_custom_fields.sql — BMW CRM: generic Custom Fields engine
--
-- Built once, reused across Clients, Scope of Work, Daily Tasks,
-- and Kanban cards (entity_type distinguishes which).
--
-- Admin defines:
--   - field name
--   - field type
--   - dropdown/radio options
--   - required/optional
--
-- Values are stored polymorphically keyed by:
--   (entity_type, entity_id)
--
-- UUIDs use gen_random_uuid(), which is supported by modern
-- PostgreSQL/Supabase and avoids dependency on uuid-ossp.
--
-- Idempotent — safe to run multiple times.
-- ============================================================


-- ============================================================
-- CUSTOM_FIELD_DEFS
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_field_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  -- 'client' | 'scope_of_work' | 'daily_task' | 'kanban_card'
  --
  -- Kept as TEXT instead of an enum so new entity types can be
  -- introduced without requiring another database migration.
  entity_type TEXT NOT NULL,

  field_name TEXT NOT NULL,

  field_type TEXT NOT NULL
    CHECK (
      field_type IN (
        'text',
        'file',
        'dropdown',
        'checkbox',
        'radio'
      )
    ),

  -- Only meaningful for dropdown/radio.
  --
  -- Example:
  -- ["Option A", "Option B", "Option C"]
  --
  -- NULL/empty for text/file/checkbox.
  field_options JSONB NOT NULL DEFAULT '[]'::jsonb,

  is_required BOOLEAN NOT NULL DEFAULT FALSE,

  position INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_custom_field_defs_account_entity
  ON custom_field_defs(account_id, entity_type);


ALTER TABLE custom_field_defs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- CUSTOM_FIELD_DEFS RLS
-- ============================================================

DROP POLICY IF EXISTS "Viewers can read custom field defs"
ON custom_field_defs;

CREATE POLICY "Viewers can read custom field defs"
ON custom_field_defs
FOR SELECT
USING (
  is_account_member(account_id, 'viewer')
);


DROP POLICY IF EXISTS "Admins can manage custom field defs"
ON custom_field_defs;

CREATE POLICY "Admins can manage custom field defs"
ON custom_field_defs
FOR ALL
USING (
  is_account_member(account_id, 'admin')
)
WITH CHECK (
  is_account_member(account_id, 'admin')
);


-- ============================================================
-- CUSTOM_FIELD_VALUES
--
-- Polymorphic:
-- one row per (field, entity)
--
-- value:
--   text/dropdown/radio values
--   checkbox state stored as 'true'/'false'
--
-- file_storage_path:
--   uploaded object's path for file-type fields
--
-- Files use the existing "files" storage bucket.
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  field_id UUID NOT NULL
    REFERENCES custom_field_defs(id)
    ON DELETE CASCADE,

  entity_type TEXT NOT NULL,

  entity_id UUID NOT NULL,

  value TEXT,

  file_storage_path TEXT,

  file_name TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  UNIQUE (field_id, entity_id)
);


CREATE INDEX IF NOT EXISTS idx_custom_field_values_entity
  ON custom_field_values(entity_type, entity_id);


ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- CUSTOM_FIELD_VALUES RLS
-- ============================================================

DROP POLICY IF EXISTS "Viewers can read custom field values"
ON custom_field_values;

CREATE POLICY "Viewers can read custom field values"
ON custom_field_values
FOR SELECT
USING (
  is_account_member(account_id, 'viewer')
);


DROP POLICY IF EXISTS "Employees can manage custom field values"
ON custom_field_values;

CREATE POLICY "Employees can manage custom field values"
ON custom_field_values
FOR ALL
USING (
  is_account_member(account_id, 'employee')
)
WITH CHECK (
  is_account_member(account_id, 'employee')
);


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at
ON custom_field_values;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON custom_field_values
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- END OF 047_custom_fields.sql
-- ============================================================