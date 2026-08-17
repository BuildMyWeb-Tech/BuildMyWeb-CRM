-- ============================================================
-- 040_sales_lead_fields.sql — BMW CRM Phase 1: Sales module
--
-- Adds AI-qualification fields to `contacts` (niche, matched
-- product, score, priority, pain point, reason) plus two tracking
-- fields: `lead_source` (how the contact entered the system) and
-- `search_category` (the raw niche keyword typed into the Lead
-- Sourcing form — kept separate from the AI-derived `niche` so the
-- qualification prompt has the original search context even after
-- the AI normalizes it into one of the three canonical niches).
--
-- No new "sales stage" column: stage progression (NEW -> QUALIFIED
-- -> ... -> WON) is handled by the existing deals/pipeline_stages
-- Kanban — this migration seeds a "BuildMyWeb Sales" pipeline with
-- those exact stages per account so a deal can represent each
-- qualified lead's position in the funnel.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS niche TEXT,
  ADD COLUMN IF NOT EXISTS matched_product TEXT,
  ADD COLUMN IF NOT EXISTS lead_score INTEGER CHECK (lead_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS priority TEXT CHECK (priority IN ('HOT', 'WARM', 'COLD')),
  ADD COLUMN IF NOT EXISTS pain_point TEXT,
  ADD COLUMN IF NOT EXISTS ai_reason TEXT,
  ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS search_category TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(priority) WHERE priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_matched_product ON contacts(matched_product) WHERE matched_product IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lead_source ON contacts(lead_source);

-- ============================================================
-- SEED: one "BuildMyWeb Sales" pipeline per existing account,
-- with the 11 stages from the original sales pipeline spec.
-- Skipped for an account that already has a pipeline of this name
-- (so this is safe to re-run and safe to run after you've already
-- created accounts by hand).
-- ============================================================
DO $$
DECLARE
  acct RECORD;
  new_pipeline_id UUID;
  stage_names TEXT[] := ARRAY[
    'NEW', 'QUALIFIED', 'MESSAGE_READY', 'CONTACTED', 'REPLIED',
    'INTERESTED', 'DEMO_BOOKED', 'REQUIREMENT', 'PROPOSAL_SENT',
    'NEGOTIATION', 'WON'
  ];
  stage_colors TEXT[] := ARRAY[
    '#94a3b8', '#60a5fa', '#38bdf8', '#22d3ee', '#2dd4bf',
    '#34d399', '#a3e635', '#facc15', '#fb923c', '#f97316', '#22c55e'
  ];
  i INTEGER;
BEGIN
  FOR acct IN SELECT id, owner_user_id FROM accounts LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pipelines WHERE account_id = acct.id AND name = 'BuildMyWeb Sales'
    ) THEN
      INSERT INTO pipelines (account_id, user_id, name)
      VALUES (acct.id, acct.owner_user_id, 'BuildMyWeb Sales')
      RETURNING id INTO new_pipeline_id;

      FOR i IN 1 .. array_length(stage_names, 1) LOOP
        INSERT INTO pipeline_stages (pipeline_id, name, position, color)
        VALUES (new_pipeline_id, stage_names[i], i, stage_colors[i]);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Note: NOT_INTERESTED / NO_RESPONSE / LOST are handled as
-- `deals.status = 'lost'` (existing column) rather than extra
-- stages, matching the deals table's existing open/won/lost model.