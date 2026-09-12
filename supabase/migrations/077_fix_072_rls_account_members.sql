-- ============================================================
-- 077_fix_072_rls_account_members.sql
--
-- Migration 072 referenced a non-existent `account_members` table
-- in its RLS policies. Membership is tracked via profiles.account_id
-- + profiles.account_role using the is_account_member() helper.
-- This migration replaces those broken policies with correct ones.
-- ============================================================

-- ── Fix crm_automations policies ─────────────────────────────────────────
DROP POLICY IF EXISTS "crm_automations_select" ON crm_automations;
CREATE POLICY "crm_automations_select" ON crm_automations
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "crm_automations_insert" ON crm_automations;
CREATE POLICY "crm_automations_insert" ON crm_automations
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "crm_automations_update" ON crm_automations;
CREATE POLICY "crm_automations_update" ON crm_automations
  FOR UPDATE USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS "crm_automations_delete" ON crm_automations;
CREATE POLICY "crm_automations_delete" ON crm_automations
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- ── Fix crm_automation_logs policies ─────────────────────────────────────
DROP POLICY IF EXISTS "crm_automation_logs_select" ON crm_automation_logs;
CREATE POLICY "crm_automation_logs_select" ON crm_automation_logs
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "crm_automation_logs_insert" ON crm_automation_logs;
CREATE POLICY "crm_automation_logs_insert" ON crm_automation_logs
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

-- ── Fix direct_messages insert policy ────────────────────────────────────
DROP POLICY IF EXISTS "direct_messages_insert" ON direct_messages;
CREATE POLICY "direct_messages_insert" ON direct_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    is_account_member(account_id, 'viewer')
  );
