-- ============================================================
-- phase0-5-test-data.sql — BMW CRM Phase 6: QA seed data
--
-- Seeds realistic dummy rows across everything built in Phases
-- 0-5 (Sales leads/deals, Projects/tasks, folders, Company Info
-- fields) so you can test the UI without waiting on real scraped
-- leads or manually typing in a dozen tasks first.
--
-- WHAT THIS DOES NOT SEED, AND WHY:
--   - No actual file bytes / Storage objects. SQL can create
--     `files` table ROWS, but not real objects in the private
--     `files`/`task-attachments` buckets — a row pointing at a
--     storage_path that doesn't exist would make the UI show a
--     broken download. Upload a couple of real test files through
--     the UI instead (folders below give you somewhere to put them).
--   - No Lead Sourcing scrape. That flow calls LeadScout + OpenAI
--     live — seeding fake "already qualified" contacts here lets
--     you test the Contacts/Kanban DISPLAY side, but the actual
--     search -> qualify pipeline still needs one real run through
--     the UI to be genuinely tested.
--   - No office_access grants. Meaningfully testing "does the
--     checkbox actually grant/revoke access" needs a second real
--     account member — can't fabricate a second auth.users row
--     safely from SQL. Invite a second person (or a throwaway
--     account) if you want to test that path.
--
-- Run this ONCE against your test/dev Supabase project, after
-- migrations 001-043 are all applied. Safe to re-run — it clears
-- its own previously-seeded rows first (tagged via a fixed marker
-- in a couple of key text fields) rather than accumulating dupes.
--
-- Assumes you have exactly one account (the common case for a
-- solo dev testing). If you have more than one, edit the
-- `v_account_id` lookup below to pick the right one explicitly.
-- ============================================================

DO $$
DECLARE
  v_account_id   UUID;
  v_owner_id     UUID;
  v_pipeline_id  UUID; -- BuildMyWeb Sales pipeline (seeded by 040)
  v_stage_new    UUID;
  v_stage_qual   UUID;
  v_stage_contacted UUID;
  v_stage_won    UUID;

  v_contact_1 UUID; v_contact_2 UUID; v_contact_3 UUID;
  v_contact_4 UUID; v_contact_5 UUID;

  v_proj1_id UUID; v_proj1_pipeline UUID;
  v_proj1_todo UUID; v_proj1_progress UUID; v_proj1_review UUID; v_proj1_done UUID;

  v_proj2_id UUID; v_proj2_pipeline UUID;
  v_proj2_todo UUID; v_proj2_progress UUID; v_proj2_review UUID; v_proj2_done UUID;

  v_field_legal UUID; v_field_gstin UUID; v_field_bank UUID; v_field_website UUID;
BEGIN
  -- ----------------------------------------------------------
  -- 0. Resolve the account + its owner to seed into.
  -- ----------------------------------------------------------
  SELECT id, owner_user_id INTO v_account_id, v_owner_id
  FROM accounts ORDER BY created_at ASC LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No account found — sign up in the app first, then re-run this seed.';
  END IF;

  -- ----------------------------------------------------------
  -- Cleanup from a previous run of this exact script (idempotent).
  -- Tagged rows only — never touches anything you created by hand.
  -- ----------------------------------------------------------
  DELETE FROM project_tasks WHERE account_id = v_account_id AND title LIKE '[SEED] %';
  DELETE FROM projects WHERE account_id = v_account_id AND name LIKE '[SEED] %';
  -- Projects don't cascade-delete their pipeline (ON DELETE RESTRICT,
  -- see 041_client_projects.sql), so a re-run without this line would
  -- pile up duplicate "[SEED] ... Board" pipelines forever. Safe here
  -- since the projects referencing them were just deleted above.
  DELETE FROM pipelines WHERE account_id = v_account_id AND name LIKE '[SEED] %';
  DELETE FROM file_folders WHERE account_id = v_account_id AND name LIKE '[SEED] %';
  DELETE FROM company_info_values WHERE account_id = v_account_id
    AND field_id IN (SELECT id FROM company_info_fields WHERE account_id = v_account_id AND field_name LIKE '[SEED] %');
  DELETE FROM company_info_fields WHERE account_id = v_account_id AND field_name LIKE '[SEED] %';
  DELETE FROM deals WHERE contact_id IN (SELECT id FROM contacts WHERE account_id = v_account_id AND name LIKE '[SEED] %');
  DELETE FROM contacts WHERE account_id = v_account_id AND name LIKE '[SEED] %';

  -- ----------------------------------------------------------
  -- 1. Sales: 5 seeded leads across niches/priorities, matching
  --    what a real Lead Sourcing run + AI Qualification would
  --    produce (Phase 1).
  -- ----------------------------------------------------------
  INSERT INTO contacts (account_id, user_id, name, phone, website, company, lead_source, search_category, niche, matched_product, lead_score, priority, pain_point, ai_reason)
  VALUES (v_account_id, v_owner_id, '[SEED] Glow Unisex Salon', '+919800000101', NULL, 'Andheri West, Mumbai', 'maps_scraper', 'unisex salon', 'salon', 'Salon Booking Management System', 84, 'HOT', 'No online booking system detected', 'Active salon with strong reviews but no booking widget on their site')
  RETURNING id INTO v_contact_1;

  INSERT INTO contacts (account_id, user_id, name, phone, website, company, lead_source, search_category, niche, matched_product, lead_score, priority, pain_point, ai_reason)
  VALUES (v_account_id, v_owner_id, '[SEED] Fresh Mart Grocery', '+919800000102', NULL, 'Kandivali East, Mumbai', 'maps_scraper', 'grocery store', 'pharmacy_grocery_retail', 'Billing Core', 71, 'HOT', 'Likely manual billing, no visible POS system', 'No website; grocery stores this size typically run manual billing')
  RETURNING id INTO v_contact_2;

  INSERT INTO contacts (account_id, user_id, name, phone, website, company, lead_source, search_category, niche, matched_product, lead_score, priority, pain_point, ai_reason)
  VALUES (v_account_id, v_owner_id, '[SEED] Trendy Threads Wholesale', '+919800000103', 'trendythreads.example.com', 'Bandra, Mumbai', 'maps_scraper', 'clothing wholesaler', 'ecommerce_retail', 'GoCart (Multi-Vendor Ecommerce)', 55, 'WARM', 'Existing site has no multi-vendor or inventory features', 'Has a basic website but it looks like a single static catalog, not a real storefront')
  RETURNING id INTO v_contact_3;

  INSERT INTO contacts (account_id, user_id, name, phone, website, company, lead_source, search_category, niche, matched_product, lead_score, priority, pain_point, ai_reason)
  VALUES (v_account_id, v_owner_id, '[SEED] City Pharmacy', '+919800000104', 'citypharmacy.example.com', 'Powai, Mumbai', 'maps_scraper', 'pharmacy', 'pharmacy_grocery_retail', 'Billing Core', 38, 'COLD', 'Already appears to have a working billing system', 'Website mentions an existing POS/billing setup, lowering opportunity')
  RETURNING id INTO v_contact_4;

  INSERT INTO contacts (account_id, user_id, name, phone, website, company, lead_source, search_category, niche, matched_product, lead_score, priority, pain_point, ai_reason)
  VALUES (v_account_id, v_owner_id, '[SEED] Downtown Consulting LLP', '+919800000105', NULL, 'BKC, Mumbai', 'maps_scraper', 'consulting firm', 'unclear', 'NONE', 15, 'COLD', 'Not a fit for any current product', 'Consulting firm — none of the 3 products apply')
  RETURNING id INTO v_contact_5;

  -- Deals for the 4 qualified (non-NONE) leads, spread across
  -- pipeline stages so the Sales Kanban and dashboard aren't empty.
  SELECT id INTO v_pipeline_id FROM pipelines WHERE account_id = v_account_id AND name = 'BuildMyWeb Sales';
  IF v_pipeline_id IS NOT NULL THEN
    SELECT id INTO v_stage_new FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND name = 'NEW';
    SELECT id INTO v_stage_qual FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND name = 'QUALIFIED';
    SELECT id INTO v_stage_contacted FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND name = 'CONTACTED';
    SELECT id INTO v_stage_won FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND name = 'WON';

    INSERT INTO deals (user_id, pipeline_id, stage_id, contact_id, title, value, status)
    VALUES
      (v_owner_id, v_pipeline_id, v_stage_new, v_contact_1, '[SEED] Glow Unisex Salon — Salon Booking Management System', 0, 'open'),
      (v_owner_id, v_pipeline_id, v_stage_qual, v_contact_2, '[SEED] Fresh Mart Grocery — Billing Core', 0, 'open'),
      (v_owner_id, v_pipeline_id, v_stage_contacted, v_contact_3, '[SEED] Trendy Threads Wholesale — GoCart', 0, 'open'),
      (v_owner_id, v_pipeline_id, v_stage_won, v_contact_4, '[SEED] City Pharmacy — Billing Core', 60000, 'won');
  END IF;

  -- ----------------------------------------------------------
  -- 2. Projects: 2 sample projects (one contact-linked, one
  --    free-text client) each with a full 4-column board and a
  --    spread of tasks — overdue, due this week, and future — so
  --    the Projects dashboard metrics (Phase 5) have real numbers.
  -- ----------------------------------------------------------
  INSERT INTO pipelines (account_id, user_id, name) VALUES (v_account_id, v_owner_id, '[SEED] Glow Salon Website Board') RETURNING id INTO v_proj1_pipeline;
  INSERT INTO pipeline_stages (pipeline_id, name, position, color) VALUES
    (v_proj1_pipeline, 'To Do', 1, '#94a3b8'), (v_proj1_pipeline, 'In Progress', 2, '#60a5fa'),
    (v_proj1_pipeline, 'Review', 3, '#facc15'), (v_proj1_pipeline, 'Done', 4, '#22c55e');
  SELECT id INTO v_proj1_todo FROM pipeline_stages WHERE pipeline_id = v_proj1_pipeline AND name = 'To Do';
  SELECT id INTO v_proj1_progress FROM pipeline_stages WHERE pipeline_id = v_proj1_pipeline AND name = 'In Progress';
  SELECT id INTO v_proj1_review FROM pipeline_stages WHERE pipeline_id = v_proj1_pipeline AND name = 'Review';
  SELECT id INTO v_proj1_done FROM pipeline_stages WHERE pipeline_id = v_proj1_pipeline AND name = 'Done';

  INSERT INTO projects (account_id, pipeline_id, client_contact_id, client_name, name, description, status, owner_user_id, start_date, due_date)
  VALUES (v_account_id, v_proj1_pipeline, v_contact_1, NULL, '[SEED] Glow Salon Booking Setup', 'Deploying the Salon Booking product for Glow Unisex Salon.', 'active', v_owner_id, CURRENT_DATE - 10, CURRENT_DATE + 20)
  RETURNING id INTO v_proj1_id;

  INSERT INTO project_tasks (account_id, project_id, stage_id, title, description, priority, due_date, checklist, position) VALUES
    (v_account_id, v_proj1_id, v_proj1_todo, '[SEED] Collect service list from client', NULL, 'high', CURRENT_DATE - 2, '[]'::jsonb, 0), -- overdue
    (v_account_id, v_proj1_id, v_proj1_todo, '[SEED] Set up staff calendar defaults', NULL, 'normal', CURRENT_DATE + 3, '[]'::jsonb, 1), -- due this week
    (v_account_id, v_proj1_id, v_proj1_progress, '[SEED] Configure WhatsApp reminders', NULL, 'normal', CURRENT_DATE + 5, '[{"text":"Set reminder template","done":true},{"text":"Test send","done":false}]'::jsonb, 0),
    (v_account_id, v_proj1_id, v_proj1_review, '[SEED] Client walkthrough call', NULL, 'urgent', CURRENT_DATE + 1, '[]'::jsonb, 0), -- due this week
    (v_account_id, v_proj1_id, v_proj1_done, '[SEED] Domain + hosting handoff', NULL, 'low', CURRENT_DATE - 15, '[]'::jsonb, 0);

  INSERT INTO pipelines (account_id, user_id, name) VALUES (v_account_id, v_owner_id, '[SEED] Internal Tools Revamp Board') RETURNING id INTO v_proj2_pipeline;
  INSERT INTO pipeline_stages (pipeline_id, name, position, color) VALUES
    (v_proj2_pipeline, 'To Do', 1, '#94a3b8'), (v_proj2_pipeline, 'In Progress', 2, '#60a5fa'),
    (v_proj2_pipeline, 'Review', 3, '#facc15'), (v_proj2_pipeline, 'Done', 4, '#22c55e');
  SELECT id INTO v_proj2_todo FROM pipeline_stages WHERE pipeline_id = v_proj2_pipeline AND name = 'To Do';
  SELECT id INTO v_proj2_progress FROM pipeline_stages WHERE pipeline_id = v_proj2_pipeline AND name = 'In Progress';

  INSERT INTO projects (account_id, pipeline_id, client_contact_id, client_name, name, description, status, owner_user_id, start_date, due_date)
  VALUES (v_account_id, v_proj2_pipeline, NULL, 'Internal — no external client', '[SEED] Internal Tools Revamp', 'Not tied to a Sales contact — tests the free-text client_name path.', 'active', v_owner_id, CURRENT_DATE - 5, NULL)
  RETURNING id INTO v_proj2_id;

  INSERT INTO project_tasks (account_id, project_id, stage_id, title, priority, due_date, checklist, position) VALUES
    (v_account_id, v_proj2_id, v_proj2_todo, '[SEED] Audit current admin scripts', 'normal', NULL, '[]'::jsonb, 0),
    (v_account_id, v_proj2_id, v_proj2_progress, '[SEED] Rebuild deploy pipeline', 'high', CURRENT_DATE + 10, '[]'::jsonb, 0);

  -- ----------------------------------------------------------
  -- 3. File Manager folders — Office root + one project, so
  --    there's somewhere to drop real test uploads (Phase 3).
  -- ----------------------------------------------------------
  INSERT INTO file_folders (account_id, project_id, parent_id, name, created_by) VALUES
    (v_account_id, NULL, NULL, '[SEED] Bills', v_owner_id),
    (v_account_id, NULL, NULL, '[SEED] Legal', v_owner_id),
    (v_account_id, v_proj1_id, NULL, '[SEED] Client Assets', v_owner_id);

  -- ----------------------------------------------------------
  -- 4. Company Info — 2 required (one filled, one deliberately
  --    left blank so you can see the incompleteness state) and
  --    2 optional fields (Phase 4).
  -- ----------------------------------------------------------
  INSERT INTO company_info_fields (account_id, field_name, is_required, position) VALUES
    (v_account_id, '[SEED] Legal Name', TRUE, 0) RETURNING id INTO v_field_legal;
  INSERT INTO company_info_fields (account_id, field_name, is_required, position) VALUES
    (v_account_id, '[SEED] GSTIN', TRUE, 1) RETURNING id INTO v_field_gstin;
  INSERT INTO company_info_fields (account_id, field_name, is_required, position) VALUES
    (v_account_id, '[SEED] Bank Account Number', FALSE, 2) RETURNING id INTO v_field_bank;
  INSERT INTO company_info_fields (account_id, field_name, is_required, position) VALUES
    (v_account_id, '[SEED] Website', FALSE, 3) RETURNING id INTO v_field_website;

  INSERT INTO company_info_values (account_id, field_id, value, updated_by) VALUES
    (v_account_id, v_field_legal, 'BuildMyWeb Technologies', v_owner_id),
    (v_account_id, v_field_website, 'https://buildmyweb.example.com', v_owner_id);
  -- v_field_gstin and v_field_bank left unfilled on purpose — the
  -- Company Info card should show "1/2 required fields filled".

  RAISE NOTICE 'Seed complete for account %', v_account_id;
END $$;