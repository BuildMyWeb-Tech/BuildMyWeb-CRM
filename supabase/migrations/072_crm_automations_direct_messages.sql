-- Migration 072: CRM Automation Engine + Direct Messages + Chat notes
-- ■ crm_automations — visual rule builder rules for project/task/enquiry events
-- ■ crm_automation_logs — execution history per automation
-- ■ direct_messages — user↔user personal chat
-- ■ project_chat_messages.is_note — 📌 internal pinned notes in project chat

-- ── CRM Automations ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_automations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  -- conditions: [{field, operator, value}]
  conditions   JSONB NOT NULL DEFAULT '[]',
  -- actions: [{type, config}]
  actions      JSONB NOT NULL DEFAULT '[]',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  run_count    INTEGER NOT NULL DEFAULT 0,
  last_run_at  TIMESTAMPTZ,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_automations_account_idx ON crm_automations(account_id);
CREATE INDEX IF NOT EXISTS crm_automations_trigger_idx ON crm_automations(account_id, trigger_type) WHERE is_active;

ALTER TABLE crm_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_automations_select" ON crm_automations;
CREATE POLICY "crm_automations_select" ON crm_automations
  FOR SELECT USING (
    account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "crm_automations_insert" ON crm_automations;
CREATE POLICY "crm_automations_insert" ON crm_automations
  FOR INSERT WITH CHECK (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid() AND role IN ('agent', 'admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "crm_automations_update" ON crm_automations;
CREATE POLICY "crm_automations_update" ON crm_automations
  FOR UPDATE USING (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid() AND role IN ('agent', 'admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "crm_automations_delete" ON crm_automations;
CREATE POLICY "crm_automations_delete" ON crm_automations
  FOR DELETE USING (
    account_id IN (
      SELECT account_id FROM account_members WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- ── CRM Automation Logs ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_automation_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  automation_id  UUID NOT NULL REFERENCES crm_automations(id) ON DELETE CASCADE,
  trigger_data   JSONB NOT NULL DEFAULT '{}',
  actions_taken  JSONB NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'skipped')),
  error_message  TEXT,
  triggered_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_automation_logs_automation_idx ON crm_automation_logs(automation_id);
CREATE INDEX IF NOT EXISTS crm_automation_logs_account_idx ON crm_automation_logs(account_id);

ALTER TABLE crm_automation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_automation_logs_select" ON crm_automation_logs;
CREATE POLICY "crm_automation_logs_select" ON crm_automation_logs
  FOR SELECT USING (
    account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "crm_automation_logs_insert" ON crm_automation_logs;
CREATE POLICY "crm_automation_logs_insert" ON crm_automation_logs
  FOR INSERT WITH CHECK (
    account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid())
  );

-- ── Direct Messages ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS direct_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages(account_id, sender_id);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_idx ON direct_messages(account_id, recipient_id);
CREATE INDEX IF NOT EXISTS direct_messages_conv_idx ON direct_messages(
  LEAST(sender_id, recipient_id),
  GREATEST(sender_id, recipient_id)
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "direct_messages_select" ON direct_messages;
CREATE POLICY "direct_messages_select" ON direct_messages
  FOR SELECT USING (
    auth.uid() IN (sender_id, recipient_id)
  );

DROP POLICY IF EXISTS "direct_messages_insert" ON direct_messages;
CREATE POLICY "direct_messages_insert" ON direct_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    account_id IN (SELECT account_id FROM account_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "direct_messages_delete" ON direct_messages;
CREATE POLICY "direct_messages_delete" ON direct_messages
  FOR DELETE USING (
    auth.uid() = sender_id
  );

-- ── Project chat: is_note flag for 📌 internal notes ─────────────────────

ALTER TABLE project_chat_messages
  ADD COLUMN IF NOT EXISTS is_note BOOLEAN NOT NULL DEFAULT false;
