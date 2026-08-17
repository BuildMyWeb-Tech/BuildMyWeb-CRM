# BMW CRM — Phased Development Plan
Based on reading the actual `wacrm-main` repo (v0.8.0, Next.js 16 / React 19 / Supabase, 39 migrations).

## What the repo already gives us (confirmed by reading it)
- **Multi-tenant foundation is already built.** `017_account_sharing.sql` introduced `accounts`, `account_role_enum` (owner/admin/agent/viewer), and a SECURITY DEFINER helper `is_account_member(account_id, min_role)` that every RLS policy in the app now uses. Every new BMW CRM table reuses this exact function — no new auth model needed.
- **The Kanban is already generic.** `pipelines` → `pipeline_stages` → `deals` (from `001_initial_schema.sql`, extended in `002`) carries no sales-only columns on the board/stage tables. Client Projects reuses `pipelines`/`pipeline_stages` unchanged, with a new `project_tasks` table standing in for `deals`.
- **Automations engine is a switch-based registry.** `src/lib/automations/engine.ts` and `validate.ts` dispatch on `step.step_type` (`send_message`, `add_tag`, `create_deal`, `send_webhook`, `condition`, `wait`, etc.). Adding "AI Qualify Lead" as a new step type is additive, not a rewrite.
- **AI + encrypted key storage already exists.** `src/lib/ai/` has provider abstractions (`openai.ts`, `anthropic.ts`), embeddings/RAG (`knowledge.ts`, `embeddings.ts`), and encrypted BYO-key storage (`config.ts`). Sales qualification reuses this instead of a second key-management system.
- **Storage bucket pattern is established.** `008_profile_avatars_storage.sql` shows the exact idiom (bucket + path-based RLS via `storage.foldername(name)`) — reused for the Office `documents` bucket, just made private instead of public.
- **Public API + MCP server already exist** (`docs/public-api.md`, `docs/mcp.md`, `mcp-server/`) — not touched until Phase 6, since neither Projects nor Office need external exposure yet.

---

## Phase 0 — Rebrand & Navigation Shell
**No migration.**
- Update `package.json` name/description, app metadata, logo/favicon, `next-intl` copy strings.
- Restructure the dashboard nav into 3 top-level sections: **Sales**, **Projects**, **Office**. Existing pages (`(dashboard)/inbox`, `contacts`, `pipelines`, `broadcasts`, `automations`, `flows`) move under **Sales** as a route group — URLs can stay the same, just re-grouped in the sidebar component (`src/components/layout`).
- Add two empty placeholder routes: `(dashboard)/projects` and `(dashboard)/office`, gated behind nothing yet (real gating comes in Phase 4 if you opt into it).
**Done when:** app boots, renamed, 3-section nav visible, old Sales pages work exactly as before.

## Phase 1 — Sales Module: Lead Sourcing + AI Qualification
**Migration: `040_sales_lead_fields.sql`**
- Adds `niche`, `matched_product`, `lead_score`, `priority`, `pain_point`, `ai_reason`, `lead_source` directly to `contacts` (typed columns, not generic `custom_fields`, so the Kanban/dashboard can filter and sort on them cheaply).
- Seeds a **"BuildMyWeb Sales"** pipeline per account with the 11 stages from the original spec (NEW → … → WON). `NOT_INTERESTED`/`LOST` map onto the existing `deals.status = 'lost'`, no new column.
- **New page:** Lead Sourcing form (niche + location) → API route (`/api/leads/generate`) → calls your Maps Scraper server-side → dedups against `contacts.phone` (there's already a `022_contact_phone_dedup.sql` migration handling this at the DB level) → inserts contacts.
- **New automation step type:** `ai_qualify_lead`, added to `engine.ts`'s switch + `validate.ts`. Trigger: contact created with `lead_source = 'maps_scraper'`. Action: call OpenAI via the existing `src/lib/ai` provider abstraction, write the score/niche/pain-point fields back, create a `deals` row in the "BuildMyWeb Sales" pipeline at stage `NEW`.
- **Outreach:** first-touch messages must go through Meta-approved templates (WACRM's Broadcasts already handles this) — the AI's job is only to fill the template variable (e.g. the pain-point line), not write freeform first-contact copy.
**Done when:** submitting niche+location produces qualified, scored contacts with a deal card sitting in the right pipeline stage — test with the TC1-TC9 flow from before, adapted to real DB rows instead of a Sheet.

## Phase 2 — Client Projects Module
**Migration: `041_client_projects.sql`**
- New `projects` table (client link, status, owner).
- New `project_tasks` table — same shape as `deals` conceptually, but task-appropriate fields (assignee, due date, checklist, priority) instead of deal-appropriate ones (value, currency, close date). Points at `pipeline_stages`, so a project's board is just another `pipelines` row (e.g. "Website Redesign Board" with columns To Do/In Progress/Review/Done).
- **UI:** reuse the existing Kanban drag-and-drop component from `src/components/pipelines` — same `@dnd-kit` wiring, swap the data source from `deals` to `project_tasks`.
- **New pages:** `/projects` (list), `/projects/[id]` (board + task list view toggle).
**Done when:** you can create a project, spin up a board, drag tasks across stages, assign a teammate, set a due date.

## Phase 3 — BMW Office Module
**Migration: `042_bmw_office.sql`**
- `company_info` (one row per account — legal name, GSTIN, address, bank details).
- `documents` (metadata) + a new **private** `office-documents` Storage bucket, same path-based RLS idiom as the `avatars` bucket but scoped to account, not user.
- `bills` (payable/receivable, amount, due date, status, optional linked document).
- Access is admin+ write / viewer+ read by default — matches how the base app already treats "settings-class" tables like `whatsapp_config`.
**Done when:** you can upload a document, see it listed by folder, log a bill, and mark it paid.

## Phase 4 — Module-Level Permissions *(optional — do this when you add a teammate, not before)*
**Migration: `043_module_access.sql`**
- Adds a `module_access` matrix (`account_role` × module → none/view/edit) with a `has_module_access()` helper, layered on top of — not replacing — the existing `account_role` checks from Phases 1-3.
- Example use: an agent who handles Sales and Projects but shouldn't see Office bills.
- Left as a genuine no-op until you insert rows for it, so it's safe to ship early and activate later.

## Phase 5 — Unified Dashboard
**No migration.**
- Extend `src/lib/dashboard` and `src/components/dashboard` (currently sales-only: response times, volume, pipeline value, activity feed) with two more cards: **Projects** (tasks due this week, overdue count) and **Office** (bills due this week, overdue count).
- Reuses the existing dashboard data-fetching pattern — new query functions alongside the current sales ones, not a new dashboard system.

## Phase 6 — Testing, CI, Deploy
- Extend the existing Vitest suite (`vitest.config.ts`, current tests live next to their modules e.g. `engine.test.ts`) with coverage for: `ai_qualify_lead` step, project_tasks RLS, bills RLS, module_access helper.
- Confirm typecheck/build/lint still pass (`npm run typecheck && npm run build && npm run lint`) — repo's CI already runs these on every PR per the product description, so this phase is making sure BMW CRM's additions don't break that gate.
- Run the migrations against a staging Supabase project first, not production directly.
- Redeploy (Vercel/Render/Docker, whichever you're already using) and rotate any exposed secrets before going live, same discipline as your other projects.

---

## Build order & confirmation gate
Phases 0 → 1 → 2 → 3 → 5 → 6, with Phase 4 inserted whenever you actually add a teammate. Per your usual workflow: each phase ships as a complete file set, you confirm 100% before the next phase starts. Migrations are numbered to append cleanly after the repo's existing `039_inbound_media_mirror.sql` — run `040` before touching any Phase 1 code, `041` before Phase 2 code, and so on.
