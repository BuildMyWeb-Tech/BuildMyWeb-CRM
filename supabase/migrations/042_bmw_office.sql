-- ============================================================
-- 042_bmw_office.sql — BMW CRM Phase 3: BMW Office module
--
-- Company info, documents (Storage-backed), and bills. Office data
-- is treated as "settings-class" like whatsapp_config/ai_config in
-- the base app — admin+ write, viewer+ read, per the role model
-- introduced in 017_account_sharing.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- COMPANY_INFO — one row per account
-- ============================================================
CREATE TABLE IF NOT EXISTS company_info (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  legal_name TEXT,
  gstin TEXT,
  address TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read company info" ON company_info;
CREATE POLICY "Viewers can read company info" ON company_info FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage company info" ON company_info;
CREATE POLICY "Admins can manage company info" ON company_info FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON company_info;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON company_info
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DOCUMENTS — metadata; files live in the office-documents bucket
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT 'general' CHECK (folder IN ('general', 'company', 'legal', 'hr', 'projects')),
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_account_folder ON documents(account_id, folder);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read documents" ON documents;
CREATE POLICY "Viewers can read documents" ON documents FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage documents" ON documents;
CREATE POLICY "Admins can manage documents" ON documents FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- ============================================================
-- BILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('payable', 'receivable')),
  party_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_account_status ON bills(account_id, status);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read bills" ON bills;
CREATE POLICY "Viewers can read bills" ON bills FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Admins can manage bills" ON bills;
CREATE POLICY "Admins can manage bills" ON bills FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON bills;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STORAGE: office-documents bucket
-- Path convention: office-documents/{account_id}/{filename}
-- Mirrors the avatars bucket pattern from 008, but private
-- (not public) since bills/legal docs aren't meant to be world-
-- readable — access goes through signed URLs the app requests
-- after checking is_account_member() itself.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'office-documents',
  'office-documents',
  FALSE,
  20971520, -- 20 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Account members can read office documents" ON storage.objects;
CREATE POLICY "Account members can read office documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'office-documents'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'viewer')
  );

DROP POLICY IF EXISTS "Admins can upload office documents" ON storage.objects;
CREATE POLICY "Admins can upload office documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'office-documents'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete office documents" ON storage.objects;
CREATE POLICY "Admins can delete office documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'office-documents'
    AND is_account_member((storage.foldername(name))[1]::uuid, 'admin')
  );
