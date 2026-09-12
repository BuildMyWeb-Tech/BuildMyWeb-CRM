-- ============================================================
-- 078_product_tasks.sql — Product Tasks
--
-- Task board linked to individual products (product catalog items
-- from migration 062). Same shape as project_tasks but tied to
-- a product instead of a project.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products(id) ON DELETE CASCADE,
  stage_id         UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  priority         TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee_user_ids UUID[] NOT NULL DEFAULT '{}',
  due_date         DATE,
  show_date        DATE,
  checklist        JSONB NOT NULL DEFAULT '[]',
  position         INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_tasks_account ON product_tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_product_tasks_product ON product_tasks(product_id);
CREATE INDEX IF NOT EXISTS idx_product_tasks_stage ON product_tasks(stage_id);
CREATE INDEX IF NOT EXISTS idx_product_tasks_due ON product_tasks(account_id, due_date);
CREATE INDEX IF NOT EXISTS idx_product_tasks_assignees ON product_tasks USING GIN (assignee_user_ids);

ALTER TABLE product_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read product tasks" ON product_tasks;
CREATE POLICY "Viewers can read product tasks" ON product_tasks
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can create product tasks" ON product_tasks;
CREATE POLICY "Agents can create product tasks" ON product_tasks
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "Employees can update product tasks" ON product_tasks;
CREATE POLICY "Employees can update product tasks" ON product_tasks
  FOR UPDATE USING (is_account_member(account_id, 'employee'))
  WITH CHECK (is_account_member(account_id, 'employee'));

DROP POLICY IF EXISTS "Agents can delete product tasks" ON product_tasks;
CREATE POLICY "Agents can delete product tasks" ON product_tasks
  FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON product_tasks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON product_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
