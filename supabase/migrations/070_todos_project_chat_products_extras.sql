-- ============================================================
-- 070_todos_project_chat_products_extras.sql
--
-- Three independent features, bundled because they shipped together:
--
-- 1. TODOS — a personal to-do list per user, with an opt-in "make
--    public" flag that shares one item with everyone in the account
--    (read-only for everyone but its owner). No separate "list"
--    entity — every item just belongs to its creator, same flat
--    shape as client_lead_tasks.
--
-- 2. PROJECT_CHAT_MESSAGES — one chat "group" per project, no
--    separate groups table needed since project_id already is the
--    group key (same reasoning as file_folders/files using
--    project_id directly instead of a wrapper entity).
--
-- 3. PRODUCTS extras — priority + multi-select pipeline stage tags
--    (kept as a plain TEXT[] of fixed vocabulary values, validated in
--    the app layer, not a join table — the "sales AND development
--    simultaneously" requirement is exactly what an array buys you
--    without extra joins), plus product_credentials (a named URL +
--    optional username/password per product, replacing "Link 1/Link
--    2"), plus product_id support on the existing file_folders/files
--    tables so the existing FileManager component can be reused
--    as-is for product documents (same pattern client_id/lead_id
--    already established in 047/060).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- TODOS
-- ============================================================

CREATE TABLE IF NOT EXISTS todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  -- A public item is visible (read-only) to every account member —
  -- still only ever editable/deletable by its own creator.
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_account ON todos(account_id);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own or public todos" ON todos;
CREATE POLICY "Members can read own or public todos" ON todos FOR SELECT
  USING (is_account_member(account_id, 'viewer') AND (user_id = auth.uid() OR is_public));

DROP POLICY IF EXISTS "Members can create own todos" ON todos;
CREATE POLICY "Members can create own todos" ON todos FOR INSERT
  WITH CHECK (is_account_member(account_id, 'viewer') AND user_id = auth.uid());

DROP POLICY IF EXISTS "Members can manage own todos" ON todos;
CREATE POLICY "Members can manage own todos" ON todos FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can delete own todos" ON todos;
CREATE POLICY "Members can delete own todos" ON todos FOR DELETE
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_updated_at ON todos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PROJECT CHAT
-- ============================================================

CREATE TABLE IF NOT EXISTS project_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_chat_messages_project ON project_chat_messages(project_id, created_at);

ALTER TABLE project_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read project chat" ON project_chat_messages;
CREATE POLICY "Viewers can read project chat" ON project_chat_messages FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Viewers can send project chat" ON project_chat_messages;
CREATE POLICY "Viewers can send project chat" ON project_chat_messages FOR INSERT
  WITH CHECK (is_account_member(account_id, 'viewer') AND sender_user_id = auth.uid());

DROP POLICY IF EXISTS "Senders can delete their own chat messages" ON project_chat_messages;
CREATE POLICY "Senders can delete their own chat messages" ON project_chat_messages FOR DELETE
  USING (sender_user_id = auth.uid() OR is_account_member(account_id, 'admin'));

-- ============================================================
-- PRODUCTS extras
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS stage_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('high', 'urgent', 'medium', 'low', 'hold'));

CREATE TABLE IF NOT EXISTS product_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT,
  username TEXT,
  password TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_credentials_product ON product_credentials(product_id);

ALTER TABLE product_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read product credentials" ON product_credentials;
CREATE POLICY "Viewers can read product credentials" ON product_credentials FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can manage product credentials" ON product_credentials;
CREATE POLICY "Agents can manage product credentials" ON product_credentials FOR ALL
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'products', 'update'))
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'products', 'update'));

-- Backfill the old flat project_url_1/project_url_2 columns into
-- product_credentials rows so existing links aren't lost — the UI
-- moves on to the credentials list going forward, these two columns
-- stay in the schema unused rather than being dropped.
INSERT INTO product_credentials (account_id, product_id, label, url, position)
SELECT account_id, id, 'Link 1', project_url_1, 0 FROM products
WHERE project_url_1 IS NOT NULL AND project_url_1 <> ''
  AND NOT EXISTS (SELECT 1 FROM product_credentials WHERE product_id = products.id AND label = 'Link 1');

INSERT INTO product_credentials (account_id, product_id, label, url, position)
SELECT account_id, id, 'Link 2', project_url_2, 1 FROM products
WHERE project_url_2 IS NOT NULL AND project_url_2 <> ''
  AND NOT EXISTS (SELECT 1 FROM product_credentials WHERE product_id = products.id AND label = 'Link 2');

-- ============================================================
-- FileManager: product_id scope, same pattern as client_id/lead_id
-- ============================================================

ALTER TABLE file_folders ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_file_folders_product ON file_folders(product_id);
CREATE INDEX IF NOT EXISTS idx_files_product ON files(product_id);

DROP POLICY IF EXISTS "Viewers can read project folders" ON file_folders;
CREATE POLICY "Viewers can read project folders" ON file_folders FOR SELECT
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (client_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (lead_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (product_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND product_id IS NULL AND has_office_access(account_id))
  );

DROP POLICY IF EXISTS "Agents can manage project folders" ON file_folders;
CREATE POLICY "Agents can manage project folders" ON file_folders FOR ALL
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (client_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (lead_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (product_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND product_id IS NULL AND is_account_member(account_id, 'admin'))
  )
  WITH CHECK (
    (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (client_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (lead_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (product_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND product_id IS NULL AND is_account_member(account_id, 'admin'))
  );

DROP POLICY IF EXISTS "Viewers can read project files" ON files;
CREATE POLICY "Viewers can read project files" ON files FOR SELECT
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (client_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (lead_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (product_id IS NOT NULL AND is_account_member(account_id, 'viewer'))
    OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND product_id IS NULL AND has_office_access(account_id))
  );

DROP POLICY IF EXISTS "Agents can manage project files" ON files;
CREATE POLICY "Agents can manage project files" ON files FOR ALL
  USING (
    (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (client_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (lead_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (product_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND product_id IS NULL AND is_account_member(account_id, 'admin'))
  )
  WITH CHECK (
    (project_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (client_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (lead_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (product_id IS NOT NULL AND is_account_member(account_id, 'agent'))
    OR (project_id IS NULL AND client_id IS NULL AND lead_id IS NULL AND product_id IS NULL AND is_account_member(account_id, 'admin'))
  );
