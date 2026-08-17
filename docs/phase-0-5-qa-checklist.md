# BMW CRM — Phase 0-6 QA Checklist
(filename kept as phase-0-5-qa-checklist.md — deployment-guide.md already links here)

Run `supabase/seed/phase0-5-test-data.sql` in your Supabase SQL editor first — most checks below assume it's been run. Test as the account owner unless a step says otherwise.

---

## Phase 0 — Rebrand & Nav
- [ ] Browser tab shows "BMW CRM"; sidebar header shows "BuildMyWeb CRM"
- [ ] Sidebar logo renders (blue/gray chevron mark), looks right in both light and dark mode
- [ ] Nav shows Dashboard + Notifications ungrouped at top, then Sales / Projects / Office sections
- [ ] Log in as an `agent` role: Office section is hidden from the sidebar entirely
- [ ] Log in as a `viewer` role: Broadcasts/Automations/Flows/AI Agents are hidden (agent-and-up only), but Inbox/Contacts/Pipelines still show

## Phase 1 — Lead Sourcing + AI Qualification
- [ ] Seeded contacts (`[SEED] Glow Unisex Salon`, etc.) show up in Contacts with niche/score/priority/pain point filled in correctly
- [ ] Seeded deals appear in the BuildMyWeb Sales pipeline, spread across NEW/QUALIFIED/CONTACTED/WON columns
- [ ] **Live test** (not seeded): run one real Lead Sourcing search (small `count`, e.g. 5) — confirm new contacts appear, are scored, and a deal lands in NEW
- [ ] Run the same search again — confirm duplicates are skipped (`duplicates` count in the response, not new rows)
- [ ] Search a niche/location combo you expect zero results for — confirm a clean "0 found" instead of an error
- [ ] Temporarily break the OpenAI key in Settings → AI Agents, run a search — confirm contacts still import with the "no AI configured" / qualify-failed notice, not a crash

## Phase 2 — Client Projects
- [ ] Both seeded projects appear in the Projects list; the one with `client_name` only (no linked contact) shows "Internal — no external client" correctly
- [ ] Open `[SEED] Glow Salon Booking Setup` — board shows 4 columns with the seeded tasks spread across them
- [ ] Drag a task to a different column — confirm it sticks after a page reload
- [ ] Board Settings: rename a column, reorder columns, add a new column — all persist
- [ ] Try deleting a column that still has tasks in it — confirm it's blocked with a clear message
- [ ] Create a brand-new project from scratch (not seeded) — confirm its board auto-gets the 4 default columns
- [ ] As a `viewer`: can see the board and drag nothing (no create/edit/delete controls, drag is blocked)

## Phase 3 — File Manager
- [ ] Open Files on the seeded project — see the `[SEED] Client Assets` folder
- [ ] Open Office → Files — see `[SEED] Bills` and `[SEED] Legal` folders
- [ ] **Upload a real file** into one of these (a PDF, an image) — confirm it appears, size shows correctly
- [ ] Create a nested subfolder, navigate in via breadcrumb, navigate back out
- [ ] Rename a file and a folder
- [ ] Try deleting a folder that has a file in it — confirm it's blocked ("not empty")
- [ ] Toggle a file to public, copy the link, open it in an incognito window — downloads without login
- [ ] Toggle it back to private, reload the same incognito link — 404s
- [ ] As a `viewer` on the project: can see/download project files, upload/rename/delete controls are blocked
- [ ] As an `agent` with no Office access grant: Office files are not visible

## Phase 4 — BMW Office
- [ ] Company Info shows the 4 seeded fields; the "Company Info" metric shows 1/2 required fields filled (GSTIN deliberately left blank)
- [ ] Try saving with a required field blank — blocked with a clear error
- [ ] Fill in the missing required field, save — completeness updates everywhere it's shown (including the dashboard card)
- [ ] Admin: add a brand-new field, mark it required, delete a field
- [ ] Access tab: grant a non-admin teammate access, confirm they can now see Company Info + Files (Office) but "Manage fields" / Save / uploads stay hidden for them (view-only)
- [ ] Revoke that grant — confirm they lose access again
- [ ] As a plain `agent` with no grant: the Office nav link itself doesn't show

## Phase 5 — Dashboards
- [ ] Overview tab (default landing): 2 cards per module, all populated from seed data, no errors
- [ ] Click "View full dashboard" on each module section — jumps to the right tab
- [ ] Sales tab looks and behaves exactly as it did before Phase 5 (nothing regressed — it's the same code, just moved)
- [ ] Projects tab: "Overdue Tasks" and "Tasks Due This Week" match what you'd count by eye in the seeded tasks (1 overdue, 2 due this week across both seeded projects)
- [ ] Office tab: shortcuts ("Company Info", "Open Files") deep-link to `/office?tab=info` and `/office?tab=files` correctly, landing on the right tab instead of always defaulting to Company Info
- [ ] Activity feeds (Projects tab, Office tab) show the seeded project/task/file events, most recent first

## Phase 6 — Deployment
- [ ] `npm run typecheck && npm test && npm run build` all pass locally before pushing
- [ ] Migrations 001-043 applied in order against the production Supabase project (Phase 1-4 ones specifically: 040, 041, 042, 043)
- [ ] Storage buckets `avatars`, `task-attachments`, `files` all exist in production Supabase
- [ ] All required env vars set on the deploy platform (see `docs/deployment-guide.md`) — especially `LEADSCOUT_API_URL`, `ENCRYPTION_KEY`, `META_APP_SECRET`
- [ ] First deploy build completes without errors on the actual platform (Render/Vercel), not just locally
- [ ] Meta WhatsApp webhook URL updated to point at the live deployment
- [ ] Sign up / log in works on the live URL
- [ ] Run `supabase/seed/phase0-5-test-data.sql` against production, re-verify a handful of the Phase 0-5 checks above against the LIVE site (not localhost) — a working local build doesn't guarantee env vars are wired correctly on the actual host
- [ ] Run `scripts/reset-business-data.sql` once satisfied — confirm the app is still usable afterward (login works, Sales pipeline structure still exists) before considering it "ready for real data"

---

## Cross-cutting checks (run these on top of, not instead of, Phase 6 above)
- [ ] Full page reload on every module (Sales/Projects/Office/Dashboard) — no client-side crash, no hydration warning in the console
- [ ] Re-run `supabase/seed/phase0-5-test-data.sql` a second time — confirm it cleans up and re-seeds without leaving duplicates (this is what actually validates the cleanup logic in the script)