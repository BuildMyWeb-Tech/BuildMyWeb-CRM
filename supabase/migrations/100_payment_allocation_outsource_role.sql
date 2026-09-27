-- Migration 100: Add outsource_role column to payment_allocations
-- Allows outsource allocations to store a role label separately from
-- the outsource person/company name (stored in role_label).

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS outsource_role TEXT;
