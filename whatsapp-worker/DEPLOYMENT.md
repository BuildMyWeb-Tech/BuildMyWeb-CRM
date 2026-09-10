# WhatsApp Worker — Deployment Requirements

## Why a separate process is required

The WhatsApp QR/linked-device protocol (Baileys) requires a **persistent long-running
Node.js process**. It cannot run inside Next.js API routes because:

- Vercel/edge functions are stateless and time-limited
- The WhatsApp WebSocket must stay open continuously
- Session state must survive process restarts

## Session persistence model

Session credentials are **encrypted and stored in Supabase** (`whatsapp_session_state`
table, service-role only). This means:

| Scenario | Result |
|---|---|
| Worker process restarts | Session loaded from DB → reconnects without QR |
| Container/VM restarts | Session loaded from DB → reconnects without QR |
| WhatsApp invalidates session | `LOGGED_OUT` → QR required |
| Worker upgrade / redeploy | Session loaded from DB → reconnects without QR |

No persistent filesystem mount is required.

## Minimum hosting requirements

The worker needs a host that can run a **persistent Node.js 22 process**:

- A VPS (DigitalOcean Droplet, Linode, EC2, etc.)
- A Railway/Render/Fly.io **worker service** (not a function)
- A Docker container on any orchestrator
- A PM2-managed process on any Linux server

**Vercel, Netlify, Cloudflare Workers are NOT suitable** — they are stateless.

## Environment variables

Copy `whatsapp-worker/.env.example` to `whatsapp-worker/.env` and fill in:

```
SUPABASE_URL                    # Same as CRM
SUPABASE_SERVICE_ROLE_KEY       # Keep secret — bypasses RLS
WHATSAPP_SESSION_ENCRYPTION_KEY # 32 bytes as hex — DIFFERENT from CRM ENCRYPTION_KEY
WHATSAPP_WORKER_ID              # Stable UUID for this worker instance
WHATSAPP_ACCOUNT_ID             # UUID of the whatsapp_accounts row (created in Phase 3)
```

## Starting the worker

```bash
cd whatsapp-worker
npm install
cp .env.example .env        # fill in values
npm start                   # production
npm run dev                 # development (auto-restart on file change)
```

## Process manager (production)

```bash
# PM2 example
pm2 start "npm start" --name whatsapp-worker --cwd /path/to/whatsapp-worker
pm2 save
pm2 startup
```

## Docker example

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
```

## Restart behavior

Normal restart sequence:

```
worker stops
  → worker starts
  → loads WHATSAPP_ACCOUNT_ID from env
  → acquires connection lock in DB (stale lock released after 2 min)
  → loads encrypted session from whatsapp_session_state
  → decrypts with WHATSAPP_SESSION_ENCRYPTION_KEY
  → initializes Baileys with saved credentials
  → reconnects to WhatsApp
  → CONNECTED — no QR required
```

If the session was invalidated by WhatsApp:

```
worker starts
  → loads session → initializes Baileys
  → WhatsApp rejects credentials
  → state → QR_REQUIRED
  → QR stored in whatsapp_accounts.qr_data_uri
  → Phase 3 QR UI displays it for scanning
```
