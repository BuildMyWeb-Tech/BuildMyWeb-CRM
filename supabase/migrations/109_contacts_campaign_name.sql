-- Add campaign_name to contacts so Lead Sourcing can group
-- contacts under a named campaign (e.g. "Gym First Campaign Trichy").
-- Idempotent — safe to run multiple times.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS campaign_name TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_campaign_name
  ON contacts(account_id, campaign_name)
  WHERE campaign_name IS NOT NULL;
