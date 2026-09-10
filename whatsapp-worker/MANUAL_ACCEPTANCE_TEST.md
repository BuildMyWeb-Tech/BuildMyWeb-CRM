# WhatsApp QR — Manual Acceptance Test

This test verifies the full QR scan → persistent session → messaging cycle.

## Prerequisites

1. `whatsapp_accounts` row exists for the account (created via CRM → WhatsApp Connect).
2. Worker env vars set (see `DEPLOYMENT.md`).
3. A second phone with WhatsApp to scan the QR.

---

## Test Steps

### A. Connect

1. Open CRM → Office → **WhatsApp Connect** (`/whatsapp-connect`).
2. Click **Connect WhatsApp** (creates the `whatsapp_accounts` row if not present).
3. Start the worker: `npm start` inside `whatsapp-worker/`.
4. Wait for QR to appear on the page (status badge: **QR Required**). May take 5–15 s.
5. On the second phone: WhatsApp → ⋮ Menu → Linked Devices → Link a Device → scan QR.
6. Status badge changes to **Connected**. `whatsapp_accounts.connection_state = 'CONNECTED'`.

### B. Incoming Messages

7. Send a WhatsApp message from the second phone to the connected number.
8. In the CRM, open **Inbox**. Verify the message appears in the conversation thread.
9. Confirm the contact was created (or reused if it existed) in the CRM contacts list.

### C. Outgoing Messages

10. In the CRM Inbox, reply to the conversation.
11. Verify the reply arrives on the second phone.
12. Check that the CRM message row transitions: `sending` → `sent`.

### D. Session Persistence (Critical)

13. Stop the worker (`Ctrl+C` / SIGTERM).
14. CRM shows status: **Reconnecting** (worker heartbeat gone stale after ~2 min).
15. Start the worker again: `npm start`.
16. Within 30 s, status returns to **Connected** — **no new QR was generated**.
17. Send another message from the second phone. It appears in the CRM inbox.

### E. Deliberate Disconnect

18. In CRM WhatsApp Connect, click **Disconnect WhatsApp** → confirm.
19. Within 30 s (next heartbeat), worker calls `provider.logout()`.
20. CRM shows **Logged Out**.
21. Start the worker again. A new QR appears — session was cleared.

---

## Expected Behaviors Summary

| Scenario | Expected |
|---|---|
| Worker restart (session valid) | CONNECTED without QR |
| Network blip | RECONNECTING → CONNECTED (no QR) |
| WhatsApp logs out the device | LOGGED_OUT → QR required |
| User clicks Disconnect | LOGGED_OUT → QR required |
| Incoming message | Appears in existing CRM conversation |
| Reply from CRM | Arrives on WhatsApp |

---

## Provider-Specific Limitations

- **Media downloads**: Incoming media (images, documents) appears as `[image]`/`[document]` placeholder in the inbox. Full media mirroring to Supabase Storage requires `messages.media_url` to be populated. The worker emits the `contentType` but does not yet download Baileys media (requires `downloadMediaMessage` from Baileys). This is a Phase 6 enhancement.
- **Templates / Interactive**: QR path supports text and media only. Templates are Meta Cloud API–specific and will error if sent via a QR account.
- **Broadcast**: Not implemented for QR accounts.
- **Multi-device WhatsApp limitations**: Baileys uses the WhatsApp Web multi-device protocol. Linked device sessions can be invalidated by the WhatsApp mobile app (Settings → Linked Devices → Remove). This correctly triggers LOGGED_OUT and requires a new QR.
