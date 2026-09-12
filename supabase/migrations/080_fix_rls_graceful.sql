-- 080_fix_rls_graceful.sql
-- Replacement for 079 — wraps each policy block in its own DO $$ block
-- so a missing table skips that section instead of aborting the whole script.

-- ── client_notes (from migration 071) ─────────────────────────────────────────
DO $$
BEGIN
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
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'client_notes table does not exist — skipping';
END $$;

-- ── whatsapp_accounts (from migration 073) ────────────────────────────────────
DO $$
BEGIN
  DROP POLICY IF EXISTS "wa_accounts_select" ON whatsapp_accounts;
  CREATE POLICY "wa_accounts_select" ON whatsapp_accounts
    FOR SELECT USING (is_account_member(account_id, 'viewer'));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'whatsapp_accounts table does not exist — skipping';
END $$;

-- ── whatsapp_message_outbox (from migration 073) ──────────────────────────────
DO $$
BEGIN
  DROP POLICY IF EXISTS "wa_outbox_select" ON whatsapp_message_outbox;
  CREATE POLICY "wa_outbox_select" ON whatsapp_message_outbox
    FOR SELECT USING (is_account_member(account_id, 'viewer'));

  DROP POLICY IF EXISTS "wa_outbox_insert" ON whatsapp_message_outbox;
  CREATE POLICY "wa_outbox_insert" ON whatsapp_message_outbox
    FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'whatsapp_message_outbox table does not exist — skipping';
END $$;
