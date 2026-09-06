-- ============================================================
-- 062_product_marketing_modules.sql — BMW CRM: new Product and
-- Marketing modules
--
-- Product: one flat list of internal/client products BMW tracks —
-- project name, purpose, up to two reference URLs, tech stack.
--
-- Marketing: one table (`marketing_items`) shared by three sub-pages
-- (Tele Calling / Content Creation / Paid Marketing), discriminated
-- by `category` — same shape everywhere (Title, Description, Status,
-- Assigned person, Date), same pattern custom_field_defs uses
-- `entity_type` for. Each category gets its OWN page-registry key
-- (marketing_tele_calling / marketing_content_creation /
-- marketing_paid_marketing) so the CRUD permission grid can gate
-- them independently, matching the granularity every other module
-- uses (e.g. Kanban and Daily Tasks are separate keys despite both
-- being "tasks").
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  purpose TEXT,
  project_url_1 TEXT,
  project_url_2 TEXT,
  tech_stack TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_account ON products(account_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read products" ON products;
CREATE POLICY "Viewers can read products" ON products FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can create products" ON products;
CREATE POLICY "Agents can create products" ON products FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'products', 'create'));

DROP POLICY IF EXISTS "Employees can update products" ON products;
CREATE POLICY "Employees can update products" ON products FOR UPDATE
  USING (is_account_member(account_id, 'employee'))
  WITH CHECK (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'products', 'update'));

DROP POLICY IF EXISTS "Agents can delete products" ON products;
CREATE POLICY "Agents can delete products" ON products FOR DELETE
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'products', 'delete'));

DROP TRIGGER IF EXISTS set_updated_at ON products;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MARKETING ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL
    CHECK (category IN ('tele_calling', 'content_creation', 'paid_marketing')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'done')),
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  item_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_items_account_category ON marketing_items(account_id, category);

ALTER TABLE marketing_items ENABLE ROW LEVEL SECURITY;

-- has_page_permission needs the RIGHT page key per row, which
-- depends on `category` — a small SQL function keeps that mapping in
-- one place instead of repeating a CASE in every policy below.
CREATE OR REPLACE FUNCTION marketing_page_key(target_category TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE target_category
    WHEN 'tele_calling' THEN 'marketing_tele_calling'
    WHEN 'content_creation' THEN 'marketing_content_creation'
    WHEN 'paid_marketing' THEN 'marketing_paid_marketing'
    ELSE 'marketing_tele_calling'
  END;
$$;

DROP POLICY IF EXISTS "Viewers can read marketing items" ON marketing_items;
CREATE POLICY "Viewers can read marketing items" ON marketing_items FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can create marketing items" ON marketing_items;
CREATE POLICY "Agents can create marketing items" ON marketing_items FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND has_page_permission(account_id, marketing_page_key(category), 'create')
  );

DROP POLICY IF EXISTS "Employees can update marketing items" ON marketing_items;
CREATE POLICY "Employees can update marketing items" ON marketing_items FOR UPDATE
  USING (is_account_member(account_id, 'employee'))
  WITH CHECK (
    is_account_member(account_id, 'employee')
    AND has_page_permission(account_id, marketing_page_key(category), 'update')
  );

DROP POLICY IF EXISTS "Agents can delete marketing items" ON marketing_items;
CREATE POLICY "Agents can delete marketing items" ON marketing_items FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    AND has_page_permission(account_id, marketing_page_key(category), 'delete')
  );

DROP TRIGGER IF EXISTS set_updated_at ON marketing_items;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON marketing_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
