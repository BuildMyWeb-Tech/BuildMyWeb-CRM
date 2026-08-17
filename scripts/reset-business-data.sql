-- ============================================================
-- scripts/reset-business-data.sql — BMW CRM Phase 6: full test-data reset
--
-- Truncates every "business data" table down to 0 rows — the
-- records you create by using the app (contacts, deals, projects,
-- tasks, files, conversations, broadcasts, automations, etc.) —
-- while deliberately PRESERVING identity and configuration so you
-- aren't locked out or have to redo setup:
--
--   KEPT:  accounts, profiles, account_invitations,
--          whatsapp_config, ai_configs, api_keys,
--          webhook_endpoints, custom_fields (field DEFINITIONS,
--          not values), company_info_fields (field DEFINITIONS,
--          not values), office_access (who's been granted access)
--
--   WIPED: everything else — see the TRUNCATE list below.
--
-- This is a genuine judgment call, not a literal "every table to
-- zero" — wiping accounts/profiles would break your own login.
-- If you want a truly total wipe (e.g. resetting a shared staging
-- Supabase project back to factory-empty before a fresh signup),
-- do that at the Supabase project level instead of with this script.
--
-- After truncating, this script re-seeds the "BuildMyWeb Sales"
-- pipeline (11 stages) for every account, since that structure is
-- expected to exist by the Sales module and Phase 1's migration
-- only seeds it once, at migration time — not on every reset.
--
-- Run in the Supabase SQL editor or via `psql`. Irreversible —
-- there's no undo once this runs.
-- ============================================================

TRUNCATE TABLE
  -- Sales: conversations, messages, contacts, deals, broadcasts
  messages,
  message_reactions,
  conversations,
  contact_notes,
  contact_tags,
  contact_custom_values,
  contacts,
  tags,
  deals,
  pipeline_stages,
  pipelines,
  broadcasts,
  broadcast_recipients,
  message_templates,
  -- Automations / Flows
  automation_logs,
  automation_pending_executions,
  automation_steps,
  automations,
  flow_run_events,
  flow_runs,
  flow_nodes,
  flows,
  -- Misc Sales-adjacent
  quick_replies,
  notifications,
  member_presence,
  ai_knowledge_chunks,
  ai_knowledge_documents,
  ai_usage_log,
  -- Projects (Phase 2)
  project_tasks,
  projects,
  -- File Manager (Phase 3) — metadata only. The actual objects in
  -- the `files` and `task-attachments` Storage buckets are NOT
  -- touched by this script — Postgres can't reach into Storage.
  -- Empty those manually in Supabase Dashboard -> Storage if you
  -- want the buckets genuinely empty too (Select All -> Delete, per
  -- bucket) — otherwise you'll have orphaned objects with no
  -- metadata row pointing at them (harmless, just wasted space).
  task_attachments,
  files,
  file_folders,
  -- Office (Phase 4) — values only, field DEFINITIONS survive
  company_info_values
  RESTART IDENTITY CASCADE;

-- ============================================================
-- Re-seed the "BuildMyWeb Sales" pipeline per account (mirrors the
-- DO block in supabase/migrations/040_sales_lead_fields.sql).
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

-- Done. contacts/deals/projects/tasks/files/conversations/etc. are
-- all at 0 rows; the Sales pipeline structure is back in place;
-- your login, WhatsApp config, AI config, and Company Info field
-- DEFINITIONS are untouched.