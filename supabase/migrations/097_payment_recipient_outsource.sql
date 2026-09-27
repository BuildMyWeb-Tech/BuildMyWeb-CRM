-- Add "outsource" as a valid recipient_type and relax the
-- recipient_user_id constraint so outsource rows can have
-- a free-text name in role_label without a user_id.

ALTER TABLE payment_allocations
  DROP CONSTRAINT IF EXISTS payment_allocations_recipient_type_check;

ALTER TABLE payment_allocations
  ADD CONSTRAINT payment_allocations_recipient_type_check
  CHECK (recipient_type IN ('company', 'team_member', 'outsource'));

ALTER TABLE payment_allocations
  DROP CONSTRAINT IF EXISTS payment_allocations_check;

-- New constraint: company → no user_id; team_member → user_id required;
-- outsource → no user_id (name goes in role_label)
ALTER TABLE payment_allocations
  ADD CONSTRAINT payment_allocations_check
  CHECK (
    (recipient_type = 'company'     AND recipient_user_id IS NULL)
    OR (recipient_type = 'team_member' AND recipient_user_id IS NOT NULL)
    OR (recipient_type = 'outsource'   AND recipient_user_id IS NULL)
  );
