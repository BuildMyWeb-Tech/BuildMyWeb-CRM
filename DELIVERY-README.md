# BMW CRM — full update: all 8 items from this batch

This is your **complete, current repo** — not a diff bundle. Extract it over your project folder (or use it as the new working copy), run `npm install`, apply the new migrations, and go.

## Apply
1. Run migrations `055_page_permission_enforcement.sql` then `056_common_kanban.sql` (in that order — 056 doesn't depend on 055, but keep numeric order regardless).
2. `npm install`
3. `npm run typecheck && npm test && npm run build` — all three passed clean in verification (845 tests, 83/83 suites, 0 typecheck/lint errors) before this was packaged.

## What's in this batch, item by item

**#1 — Workspace/Settings split.** Already correct from earlier work: Workspace (WhatsApp/Templates/Quick Replies/Fields & Tags) lives under Sales; Settings has Deals & Currency/Team Members/API Keys/Google Drive. Verified, not rebuilt.

**#2 — Client Directory.** Grid/list toggle, 3-dot menu per card (Edit inline / Delete, no navigating into the detail page), Info tab rebuilt to read-only-with-click-to-edit (matching Company Info), Files tab combines Google Docs/Sheets and uploaded files under one shared toggle (`CombinedFilesView`). The Drive `invalid_client` error you hit is a credentials mismatch between when you connected and what's running now — disconnect/reconnect after confirming `GOOGLE_DRIVE_CLIENT_ID`/`SECRET` match everywhere.

**#3 — Manage Fields, click-to-edit.** Both Company Info and the generic Custom Fields engine (Client/Scope of Work/Daily Task/Kanban Card fields): click a field's name to rename it, no pencil icon needed.

**#4 — Real permission enforcement + invite popup.** This was the big one:
- `has_page_permission()` Postgres function (migration 055), wired into RLS for Client Directory, Daily Tasks, and Kanban (boards + cards) — the correct place, since several of these write directly from the browser, not through API routes.
- Matching `requirePagePermission()` TypeScript helper, wired into all Clients/Scope-of-Work API routes for clean 403s instead of raw RLS rejections.
- Frontend buttons now actually hide too (Client Directory list/detail, Daily Tasks "New task") via the `usePagePermissions` hook.
- New User wizard: added a Role selector (Admin/Agent/Employee/Viewer — the real permission floor the grid narrows, never widens), and a Step 3 invite popup — "You're welcome to BuildMyWeb as [Role]" with username/password, Copy button, ready to paste into WhatsApp.
- **Scope, stated plainly**: this covers Client Directory, Daily Tasks, and Kanban. Legacy WACRM modules (Contacts, Deals, Broadcasts, Automations, Flows, AI config) are untouched — extending this to them is the same pattern, just not done in this pass, given the risk of touching long-tested messaging logic without a much more careful, separate review.

**#5 — Daily Tasks.** Plain filterable table, no Kanban board, filters in a persistent left column, not a dropdown.

**#6 — Notifications in the header.** Already correct from earlier work, next to the dark/light toggle. Verified, not rebuilt.

**#7 / #8 — Unified cross-project Kanban.** The other big one. `/kanban` is now ONE real drag-and-drop board (migration 056: a new account-wide `kanban_common_statuses` table + an additive `common_status_id` column on `project_tasks` — doesn't touch any project's own board/stages at all). Cards show "In {Project}" like your reference screenshot. Column headers have a 3-dot menu (Rename/Delete, admin-only) and an independent collapse/expand toggle. Filter by project or by assignee. No "create a new board" flow anymore — this page IS the one shared board. The old standalone ad-hoc Kanban boards feature (`/kanban/[id]`) still exists in the code and still works if you navigate to it directly, just isn't surfaced as an entry point from the main page anymore — nothing was deleted, only unlinked.

## Two honest bugs I found and fixed *while building this*, before they reached you
- A `KanbanCard`→`ProjectTask` shape-adapter in the old standalone board page was missing the new `common_status_id` field — caught by `tsc`, fixed immediately.
- The new Kanban page had the exact same `setState`-synchronously-in-effect issue this session has hit a few times before (a redundant `setLoading(true)` inside the load function) — caught by `eslint`, fixed the same way as every previous occurrence.

## What's still genuinely open, if you want it next
- Extending `requirePagePermission`/`has_page_permission` enforcement to more pages (Projects, Company Details, Accounts, User Management itself) — same pattern each time, just needs doing per-module.
- Frontend button-hiding for Kanban's own create/delete-column actions using `usePagePermissions("kanban")` — the hook is already there, just not wired into the "Add column"/"Delete column" buttons specifically (the board component accepts an `isAdmin` prop today, gated on `canManageMembers && gridCanUpdate`, which is a reasonable proxy but not a dedicated `canCreate`/`canDelete` check).
