-- ============================================================
-- 058_client_leads.sql — BMW CRM: Client Leads / Enquiry module
--
-- A new pre-Client-Directory stage: an enquiry that's still "in
-- discussion" — not yet a confirmed client (clients table), and
-- distinct from Sales `contacts` (WhatsApp inbox leads). Lives next
-- to Client Directory under the Clients module, not under Sales.
--
-- Lifecycle: in_discussion (default) -> confirmed | rejected | hold
--   confirmed -> the API route copies this row into `clients` (same
--     auto-project-creation flow as POST /api/clients), then deletes
--     the lead row
--   rejected  -> the API route deletes the lead row outright
--   hold      -> just a status flag, stays in the list, can move
--     back to in_discussion or on to confirmed/rejected later
--
-- client_lead_tasks is a simple flat per-lead checklist (n tasks per
-- lead) — deliberately not the generic custom_field_defs engine,
-- since these are ad-hoc todo items an agent adds while working a
-- lead, not admin-defined structured fields.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  next_follow_up_at TIMESTAMPTZ,
  allocated_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_discussion'
    CHECK (status IN ('in_discussion', 'hold', 'confirmed', 'rejected')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_leads_account ON client_leads(account_id);
CREATE INDEX IF NOT EXISTS idx_client_leads_status ON client_leads(account_id, status);
CREATE INDEX IF NOT EXISTS idx_client_leads_allocated ON client_leads(allocated_user_id);

ALTER TABLE client_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read client leads" ON client_leads;
CREATE POLICY "Viewers can read client leads" ON client_leads FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can create client leads" ON client_leads;
CREATE POLICY "Agents can create client leads" ON client_leads FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'client_leads', 'create'));

DROP POLICY IF EXISTS "Employees can update client leads" ON client_leads;
CREATE POLICY "Employees can update client leads" ON client_leads FOR UPDATE
  USING (is_account_member(account_id, 'employee'))
  WITH CHECK (is_account_member(account_id, 'employee') AND has_page_permission(account_id, 'client_leads', 'update'));

DROP POLICY IF EXISTS "Agents can delete client leads" ON client_leads;
CREATE POLICY "Agents can delete client leads" ON client_leads FOR DELETE
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'client_leads', 'delete'));

DROP TRIGGER IF EXISTS set_updated_at ON client_leads;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON client_leads
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- CLIENT_LEAD_TASKS — the "n tasks under a lead" checklist
-- ============================================================

CREATE TABLE IF NOT EXISTS client_lead_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES client_leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_lead_tasks_lead ON client_lead_tasks(lead_id);

ALTER TABLE client_lead_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Viewers can read client lead tasks" ON client_lead_tasks;
CREATE POLICY "Viewers can read client lead tasks" ON client_lead_tasks FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can manage client lead tasks" ON client_lead_tasks;
CREATE POLICY "Agents can manage client lead tasks" ON client_lead_tasks FOR ALL
  USING (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'client_leads', 'update'))
  WITH CHECK (is_account_member(account_id, 'agent') AND has_page_permission(account_id, 'client_leads', 'update'));
