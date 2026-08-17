# BMW CRM — Deployment Guide

**Recommendation: Render.** The repo ships a purpose-built `Dockerfile` + `docker-compose.yml` with a deliberate build-time-vs-runtime secrets split — that's built for a Docker host, not Vercel's serverless model. You also already run `bmw-sales-automation-n8n` on Render, so this keeps everything on one platform. Vercel steps are included below as an alternative if you'd rather run it there (works fine for the Next.js app itself — the one thing to watch is noted in that section).

---

## Before either path: production Supabase

1. Create a **new Supabase project** for production (don't reuse whatever project you've been testing phases against, unless you're intentionally promoting that same data).
2. Run every migration in `supabase/migrations/` **in order**, `001` through `043`, via the Supabase SQL editor (or `supabase db push` if you have the CLI linked). Do not run `supabase/seed/phase0-5-test-data.sql` against production — that's dev/QA only.
3. In Supabase Dashboard → Storage, confirm the 3 buckets exist and are **private** (except `avatars`, which stays public — unchanged from the base app): `avatars`, `task-attachments`, `files`. Migrations 041/042 create `task-attachments`/`files` automatically when you run them — this step is just a sanity check.
4. Note down: Project URL, anon key, service role key (Settings → API).

## Generate production secrets

```bash
# ENCRYPTION_KEY — 64 hex chars
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# AUTOMATION_CRON_SECRET — if you use Wait-steps in automations
openssl rand -hex 32
```

Get `META_APP_SECRET` (and `META_APP_ID` if you submit image-header WhatsApp templates) from Meta for Developers → your app → App Settings → Basic.

---

## Path A — Render (recommended)

### 1. Push the repo to GitHub
Render deploys from a Git repo, not a local folder — push `BuildMyWeb-CRM` to a GitHub repo if it isn't already there.

### 2. Create the Web Service
- Render Dashboard → **New → Web Service**
- Connect the repo
- **Runtime: Docker** (Render auto-detects the `Dockerfile`)
- Region: pick one close to your users (Mumbai isn't a Render region — Singapore is the closest)
- Instance type: Starter is fine to begin with; scale up if the automations/dashboard aggregation queries get slow

### 3. Environment variables
Add every var from `.env.local.example`'s REQUIRED and RECOMMENDED sections, using your production Supabase values and the secrets generated above:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your prod Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your prod anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your prod service role key |
| `ENCRYPTION_KEY` | generated above |
| `META_APP_SECRET` | from Meta for Developers |
| `NEXT_PUBLIC_SITE_URL` | your Render URL (or custom domain once attached) |
| `NEXT_PUBLIC_APP_LOCALE` | `en` |
| `LEADSCOUT_API_URL` | your LeadScout URL (optional — defaults correctly if unset) |
| `AUTOMATION_CRON_SECRET` | generated above, only if you use Wait-steps |

The Dockerfile's comment about `NEXT_PUBLIC_*` needing to be build args, not just runtime env vars, matters here — Render's "Environment Variables" panel handles this correctly for a Docker build (it passes them as build args automatically), so you don't need extra config, just make sure every `NEXT_PUBLIC_*` var above is set **before** the first deploy triggers a build.

### 4. Deploy
Render builds the Dockerfile and deploys automatically on push to your default branch. First build takes a few minutes.

### 5. Point your domain
Render → your service → Settings → Custom Domains → add `crm.buildmyweb.in` (or whatever you use) → follow the DNS instructions (usually a CNAME).

### 6. Automations cron (only if you use Wait-steps)
Set up a scheduled pinger hitting `GET /api/automations/cron` with `AUTOMATION_CRON_SECRET` — Render's own Cron Jobs feature (separate from the Web Service) works well for this. See `docs/automations-and-cron.md` in the repo for the exact request shape.

---

## Path B — Vercel (alternative)

Works for the app itself — Vercel builds Next.js directly, ignoring the Dockerfile entirely (it's not used on this path).

### 1. Import the repo
Vercel Dashboard → **Add New → Project** → import from GitHub. Vercel auto-detects Next.js, no config needed.

### 2. Environment variables
Same table as the Render section above, added under Project Settings → Environment Variables. Set them for **Production** (and Preview if you want PR previews to work against a Supabase project — usually your same prod one, or a separate staging Supabase project if you have one).

### 3. One thing to check before committing to this path
`.env.local.example` documents `AUTOMATION_CRON_SECRET` for automation Wait-steps, implying something needs to periodically hit a route to drain pending waits. On Render (a long-running container) an external pinger or Render Cron Job works simply. On Vercel, the equivalent is **Vercel Cron** (`vercel.json` with a `crons` array) — functionally fine, but it's a config file this repo doesn't currently have, since it wasn't built with Vercel in mind. If you don't use Wait-steps in your automations, skip this entirely — it's a non-issue. If you do, add a `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/automations/cron", "schedule": "*/5 * * * *" }
  ]
}
```
and confirm the cron request includes your `AUTOMATION_CRON_SECRET` (Vercel Cron calls your route with a Vercel-signed header, not an arbitrary secret in the URL — check `docs/automations-and-cron.md` for how the route expects to authenticate it, and adjust if needed).

### 4. Deploy
Push to your default branch — Vercel builds and deploys automatically.

### 5. Point your domain
Project → Settings → Domains → add your custom domain, follow Vercel's DNS instructions.

---

## After either path: smoke test

Run through `docs/phase-0-5-qa-checklist.md` against the live URL before calling it done — the seed script (`supabase/seed/phase0-5-test-data.sql`) works the same way against production Supabase as it does locally (it's self-cleaning — safe to re-run — but still, don't run it against production once real customer data exists). When you're done testing and ready for real leads, run `scripts/reset-business-data.sql` to wipe ALL business data (not just the seeded rows) back to 0 rows, without touching your login, WhatsApp/AI config, or Company Info field definitions.