-- ============================================================
-- 063_remove_print_permission.sql — BMW CRM: drop the "Print"
-- permission entirely
--
-- No API route ever checked 'print' (grep confirms every
-- requirePagePermission() call site uses create/read/update/delete
-- only), and BMW asked for the CRUD grid to be CRUD-only. Dropping
-- the column outright rather than just hiding it in the UI, so the
-- schema matches what the app actually enforces.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE OR REPLACE FUNCTION has_page_permission(
  target_account_id UUID,
  target_page_key TEXT,
  target_action TEXT -- 'create' | 'read' | 'update' | 'delete'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN is_account_member(target_account_id, 'admin') THEN TRUE
    WHEN NOT EXISTS (
      SELECT 1 FROM user_page_permissions upp
      WHERE upp.user_id = auth.uid()
        AND upp.account_id = target_account_id
        AND upp.page_key = target_page_key
    ) THEN TRUE
    ELSE (
      SELECT CASE target_action
        WHEN 'create' THEN can_create
        WHEN 'read'   THEN can_read
        WHEN 'update' THEN can_update
        WHEN 'delete' THEN can_delete
        ELSE FALSE
      END
      FROM user_page_permissions
      WHERE user_id = auth.uid()
        AND account_id = target_account_id
        AND page_key = target_page_key
    )
  END;
$$;

ALTER TABLE user_page_permissions DROP COLUMN IF EXISTS can_print;
