-- ============================================================
-- 046_client_directory.sql — BMW CRM: Client Directory module
--
-- Uses gen_random_uuid() instead of uuid_generate_v4().
-- gen_random_uuid() is available in modern PostgreSQL/Supabase
-- and avoids depending on the uuid-ossp extension.
--
-- Idempotent — safe to run multiple times.
-- ============================================================


-- ============================================================
-- CLIENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_storage_path TEXT,
  interface_name TEXT,
  interface_contact_number TEXT,
  accent_color TEXT,
  client_since DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_clients_account
  ON clients(account_id);


ALTER TABLE clients ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Viewers can read clients" ON clients;

CREATE POLICY "Viewers can read clients"
ON clients
FOR SELECT
USING (
  is_account_member(account_id, 'viewer')
);


DROP POLICY IF EXISTS "Employees can update clients" ON clients;

CREATE POLICY "Employees can update clients"
ON clients
FOR UPDATE
USING (
  is_account_member(account_id, 'employee')
)
WITH CHECK (
  is_account_member(account_id, 'employee')
);


DROP POLICY IF EXISTS "Agents can create and delete clients" ON clients;

CREATE POLICY "Agents can create and delete clients"
ON clients
FOR INSERT
WITH CHECK (
  is_account_member(account_id, 'agent')
);


DROP POLICY IF EXISTS "Agents can delete clients" ON clients;

CREATE POLICY "Agents can delete clients"
ON clients
FOR DELETE
USING (
  is_account_member(account_id, 'agent')
);


DROP TRIGGER IF EXISTS set_updated_at ON clients;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- SCOPE_OF_WORK
-- ============================================================

CREATE TABLE IF NOT EXISTS scope_of_work (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  description TEXT,
  total_monthly_unit NUMERIC(10, 2),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_scope_of_work_client
  ON scope_of_work(client_id);


CREATE INDEX IF NOT EXISTS idx_scope_of_work_account
  ON scope_of_work(account_id);


ALTER TABLE scope_of_work ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Viewers can read scope of work"
ON scope_of_work;

CREATE POLICY "Viewers can read scope of work"
ON scope_of_work
FOR SELECT
USING (
  is_account_member(account_id, 'viewer')
);


DROP POLICY IF EXISTS "Employees can update scope of work"
ON scope_of_work;

CREATE POLICY "Employees can update scope of work"
ON scope_of_work
FOR UPDATE
USING (
  is_account_member(account_id, 'employee')
)
WITH CHECK (
  is_account_member(account_id, 'employee')
);


DROP POLICY IF EXISTS "Agents can create scope of work"
ON scope_of_work;

CREATE POLICY "Agents can create scope of work"
ON scope_of_work
FOR INSERT
WITH CHECK (
  is_account_member(account_id, 'agent')
);


DROP POLICY IF EXISTS "Agents can delete scope of work"
ON scope_of_work;

CREATE POLICY "Agents can delete scope of work"
ON scope_of_work
FOR DELETE
USING (
  is_account_member(account_id, 'agent')
);


DROP TRIGGER IF EXISTS set_updated_at ON scope_of_work;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON scope_of_work
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- EXTEND FILE MANAGER WITH CLIENT SCOPE
--
-- Existing scopes:
--   project_id = project-scoped files
--   project_id IS NULL AND client_id IS NULL = Office files
--
-- New scope:
--   client_id = client-scoped files
-- ============================================================

ALTER TABLE files
ADD COLUMN IF NOT EXISTS client_id UUID
REFERENCES clients(id)
ON DELETE CASCADE;


ALTER TABLE file_folders
ADD COLUMN IF NOT EXISTS client_id UUID
REFERENCES clients(id)
ON DELETE CASCADE;


CREATE INDEX IF NOT EXISTS idx_files_client
  ON files(client_id);


CREATE INDEX IF NOT EXISTS idx_file_folders_client
  ON file_folders(client_id);


-- ============================================================
-- FILE FOLDER RLS
-- ============================================================

DROP POLICY IF EXISTS "Viewers can read project folders"
ON file_folders;

CREATE POLICY "Viewers can read project folders"
ON file_folders
FOR SELECT
USING (
  (
    project_id IS NOT NULL
    AND is_account_member(account_id, 'viewer')
  )
  OR
  (
    client_id IS NOT NULL
    AND is_account_member(account_id, 'viewer')
  )
  OR
  (
    project_id IS NULL
    AND client_id IS NULL
    AND has_office_access(account_id)
  )
);


DROP POLICY IF EXISTS "Agents can manage project folders"
ON file_folders;

CREATE POLICY "Agents can manage project folders"
ON file_folders
FOR ALL
USING (
  (
    project_id IS NOT NULL
    AND is_account_member(account_id, 'agent')
  )
  OR
  (
    client_id IS NOT NULL
    AND is_account_member(account_id, 'agent')
  )
  OR
  (
    project_id IS NULL
    AND client_id IS NULL
    AND is_account_member(account_id, 'admin')
  )
)
WITH CHECK (
  (
    project_id IS NOT NULL
    AND is_account_member(account_id, 'agent')
  )
  OR
  (
    client_id IS NOT NULL
    AND is_account_member(account_id, 'agent')
  )
  OR
  (
    project_id IS NULL
    AND client_id IS NULL
    AND is_account_member(account_id, 'admin')
  )
);


-- ============================================================
-- FILE RLS
-- ============================================================

DROP POLICY IF EXISTS "Viewers can read project files"
ON files;

CREATE POLICY "Viewers can read project files"
ON files
FOR SELECT
USING (
  (
    project_id IS NOT NULL
    AND is_account_member(account_id, 'viewer')
  )
  OR
  (
    client_id IS NOT NULL
    AND is_account_member(account_id, 'viewer')
  )
  OR
  (
    project_id IS NULL
    AND client_id IS NULL
    AND has_office_access(account_id)
  )
);


DROP POLICY IF EXISTS "Agents can manage project files"
ON files;

CREATE POLICY "Agents can manage project files"
ON files
FOR ALL
USING (
  (
    project_id IS NOT NULL
    AND is_account_member(account_id, 'agent')
  )
  OR
  (
    client_id IS NOT NULL
    AND is_account_member(account_id, 'agent')
  )
  OR
  (
    project_id IS NULL
    AND client_id IS NULL
    AND is_account_member(account_id, 'admin')
  )
)
WITH CHECK (
  (
    project_id IS NOT NULL
    AND is_account_member(account_id, 'agent')
  )
  OR
  (
    client_id IS NOT NULL
    AND is_account_member(account_id, 'agent')
  )
  OR
  (
    project_id IS NULL
    AND client_id IS NULL
    AND is_account_member(account_id, 'admin')
  )
);


-- ============================================================
-- END
-- ============================================================