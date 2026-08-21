-- ============================================================
-- 045_employee_role_ranking.sql — BMW CRM: rank "employee" in
-- is_account_member()
--
-- owner=5, admin=4, agent=3, employee=2, viewer=1 — matches
-- roleRank() in src/lib/auth/roles.ts exactly, so server-side
-- TypeScript guards and database-side RLS agree on ordering.
--
-- Written entirely in ::text comparisons rather than enum literals
-- on purpose: a value added via ALTER TYPE ... ADD VALUE (migration
-- 044) is only safely usable as an enum literal once that change
-- has fully committed on its own — and a batched `supabase db push`
-- run doesn't guarantee that ordering the way a hand-run migration
-- would. Comparing as text sidesteps the whole problem: Postgres
-- never has to validate 'employee' as a real enum member at
-- CREATE FUNCTION time, so this is safe to run regardless of
-- whether 044 landed in the same push or a separate one.
--
-- Idempotent — CREATE OR REPLACE is always safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role::text
            WHEN 'owner'    THEN 5
            WHEN 'admin'    THEN 4
            WHEN 'agent'    THEN 3
            WHEN 'employee' THEN 2
            WHEN 'viewer'   THEN 1
            ELSE 0
          END
        >=
          CASE min_role::text
            WHEN 'owner'    THEN 5
            WHEN 'admin'    THEN 4
            WHEN 'agent'    THEN 3
            WHEN 'employee' THEN 2
            WHEN 'viewer'   THEN 1
            ELSE 0
          END
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;