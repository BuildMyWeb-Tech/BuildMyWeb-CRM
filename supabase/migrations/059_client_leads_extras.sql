-- ============================================================
-- 059_client_leads_extras.sql — BMW CRM: Client Leads follow-up
-- reminders + lead source tracking
--
-- Two independent additions on top of 058_client_leads.sql:
--
-- 1. Lead source — a plain classification field so BMW can see
--    which channel (referral, website, cold call, ad, ...) actually
--    produces confirmed clients. Nullable — existing/quickly-added
--    leads don't have to set one.
--
-- 2. Follow-up reminders — `follow_up_notified_at` tracks the last
--    time this lead's due-follow-up notification fired, so the cron
--    route (GET /api/client-leads/cron, same shared-secret pattern
--    as /api/automations/cron) can tell "already notified for this
--    follow-up time" apart from "notified for an earlier one, then
--    rescheduled" — re-editing next_follow_up_at to a later time
--    naturally re-arms the reminder since the old notified_at stays
--    earlier than the new due time.
--
--    Reuses the existing `notifications` table/bell rather than a
--    new mechanism — widens its `type` CHECK and adds a nullable
--    `lead_id` FK so a reminder can link back to the lead.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE client_leads
  ADD COLUMN IF NOT EXISTS source TEXT
    CHECK (source IN ('referral', 'website', 'cold_call', 'social_media', 'advertisement', 'other'));

ALTER TABLE client_leads
  ADD COLUMN IF NOT EXISTS follow_up_notified_at TIMESTAMPTZ;

-- ============================================================
-- notifications — widen `type` to include lead follow-ups
-- ============================================================

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'lead_follow_up_due'));

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES client_leads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_lead ON notifications(lead_id);
