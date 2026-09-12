-- 079_fix_rls_account_members_071_073.sql
-- Fix RLS policies in migrations 071 and 073 that reference the
-- non-existent `account_members` table. Replace with is_account_member().

-- ── client_notes (from 071) ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_notes_viewer_select" ON client_notes;
CREATE POLICY "client_notes_viewer_select" ON client_notes
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "client_notes_employee_insert" ON client_notes;
CREATE POLICY "client_notes_employee_insert" ON client_notes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND is_account_member(account_id, 'employee')
  );

DROP POLICY IF EXISTS "client_notes_owner_delete" ON client_notes;
CREATE POLICY "client_notes_owner_delete" ON client_notes
  FOR DELETE USING (
    auth.uid() = user_id OR is_account_member(account_id, 'admin')
  );

-- ── whatsapp_accounts (from 073) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "wa_accounts_select" ON whatsapp_accounts;
CREATE POLICY "wa_accounts_select" ON whatsapp_accounts
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- ── whatsapp_message_outbox (from 073) ───────────────────────────────────────
DROP POLICY IF EXISTS "wa_outbox_select" ON whatsapp_message_outbox;
CREATE POLICY "wa_outbox_select" ON whatsapp_message_outbox
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "wa_outbox_insert" ON whatsapp_message_outbox;
CREATE POLICY "wa_outbox_insert" ON whatsapp_message_outbox
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
