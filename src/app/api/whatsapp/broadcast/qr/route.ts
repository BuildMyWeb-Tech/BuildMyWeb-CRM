/**
 * POST /api/whatsapp/broadcast/qr
 *
 * Creates a durable QR-based WhatsApp broadcast.
 *
 * Flow:
 *   Authenticate → verify account membership → verify QR account ownership
 *   → verify CONNECTED state → validate input → atomically create broadcast
 *   + recipient snapshot + outbox jobs via Postgres RPC → return immediately.
 *
 * IMPORTANT: This route does NOT send WhatsApp messages.
 *            It does NOT call Baileys.
 *            It does NOT wait for the worker.
 *            The worker processes durable outbox jobs independently.
 *
 * The existing Meta broadcast route (../route.ts) is NOT modified.
 */

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { validateQrBroadcastInput } from "@/lib/whatsapp/broadcast-qr";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

interface QrBroadcastRequestBody {
  /** Display name for the broadcast (shown in the broadcast list). */
  name?: string;
  /** IDs of CRM contacts to include (ownership verified server-side). */
  contact_ids: string[];
  /** Free-form message text. Required. */
  message_text: string;
  /** Optional: ISO-8601 string for future-dated sends. */
  scheduled_at?: string | null;
  /** Milliseconds between outbox jobs. Minimum 500. Default 1000. */
  send_interval_ms?: number;
  /** Optional media fields — persisted, sent by worker in Phase E. */
  media_url?: string | null;
  media_type?: "image" | "video" | "document" | "audio" | null;
  media_filename?: string | null;
  media_mimetype?: string | null;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_MEDIA_TYPES = new Set(["image", "video", "document", "audio"]);

function isIsoTimestamp(s: string): boolean {
  // Must be a future-ish ISO-8601 timestamp parseable to a valid Date.
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function validateRequestBody(
  body: unknown,
): { ok: true; data: QrBroadcastRequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.contact_ids) || b.contact_ids.length === 0) {
    return { ok: false, error: "contact_ids must be a non-empty array." };
  }
  for (const id of b.contact_ids) {
    if (typeof id !== "string" || !id.trim()) {
      return { ok: false, error: "Each contact_id must be a non-empty string." };
    }
  }

  if (!b.message_text || typeof b.message_text !== "string" || !b.message_text.trim()) {
    return { ok: false, error: "message_text is required." };
  }

  if (b.scheduled_at !== undefined && b.scheduled_at !== null) {
    if (typeof b.scheduled_at !== "string" || !isIsoTimestamp(b.scheduled_at)) {
      return { ok: false, error: "scheduled_at must be a valid ISO-8601 timestamp." };
    }
  }

  if (b.send_interval_ms !== undefined) {
    const v = b.send_interval_ms;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 500) {
      return { ok: false, error: "send_interval_ms must be an integer ≥ 500." };
    }
  }

  if (b.media_type !== undefined && b.media_type !== null) {
    if (!VALID_MEDIA_TYPES.has(b.media_type as string)) {
      return {
        ok: false,
        error: `media_type must be one of: ${[...VALID_MEDIA_TYPES].join(", ")}.`,
      };
    }
    if (!b.media_url || typeof b.media_url !== "string") {
      return { ok: false, error: "media_url is required when media_type is set." };
    }
  }

  return {
    ok: true,
    data: {
      name: typeof b.name === "string" ? b.name.trim() : undefined,
      contact_ids: b.contact_ids as string[],
      message_text: (b.message_text as string).trim(),
      scheduled_at: (b.scheduled_at as string | null | undefined) ?? null,
      send_interval_ms: typeof b.send_interval_ms === "number" ? b.send_interval_ms : 1000,
      media_url: (b.media_url as string | null | undefined) ?? null,
      media_type: (b.media_type as QrBroadcastRequestBody["media_type"]) ?? null,
      media_filename: (b.media_filename as string | null | undefined) ?? null,
      media_mimetype: (b.media_mimetype as string | null | undefined) ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // 1. Authenticate + enforce minimum 'agent' role (same as Meta broadcast).
    const { supabase, accountId, userId } = await requireRole("agent");

    // 2. Rate-limit per user (reuse existing broadcast limit).
    const limit = checkRateLimit(`broadcast-qr:${userId}`, RATE_LIMITS.broadcast);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    // 3. Parse + validate request body.
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const validation = validateRequestBody(rawBody);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body = validation.data;

    // 4. Validate message via lib helper (catches edge cases like whitespace-only).
    const libErrors = validateQrBroadcastInput({
      accountId,
      userId,
      name: body.name ?? "QR Broadcast",
      whatsappAccountId: "placeholder", // verified below
      messageText: body.message_text,
      contactIds: body.contact_ids,
      sendIntervalMs: body.send_interval_ms,
    });
    if (libErrors.length > 0) {
      return NextResponse.json(
        { error: libErrors.map((e) => e.message).join(" ") },
        { status: 400 },
      );
    }

    // 5. Resolve QR WhatsApp account — must belong to this account,
    //    have provider='qr', and be in CONNECTED state.
    //
    //    The user-scoped client (supabase) is used for this read so RLS
    //    enforces account membership automatically.
    const { data: qrAccount, error: qrErr } = await supabase
      .from("whatsapp_accounts")
      .select("id, connection_state, provider")
      .eq("account_id", accountId)
      .eq("provider", "qr")
      .maybeSingle();

    if (qrErr) {
      console.error("[qr-broadcast] whatsapp_accounts fetch error:", qrErr.message);
      return NextResponse.json(
        { error: "Could not verify WhatsApp connection status." },
        { status: 500 },
      );
    }

    if (!qrAccount) {
      return NextResponse.json(
        { error: "No QR WhatsApp account found for this workspace." },
        { status: 400 },
      );
    }

    const qa = qrAccount as unknown as Record<string, unknown>
    if (qa["connection_state"] !== "CONNECTED") {
      return NextResponse.json(
        {
          error: `WhatsApp is not connected (current state: ${qa["connection_state"]}). Please reconnect and try again.`,
        },
        { status: 400 },
      );
    }

    // 6. Verify that every supplied contact_id belongs to this account.
    //    The RPC also does this, but we check here first to give a clear
    //    error before entering the atomic transaction.
    //    Use count + in() — a mismatch means a foreign or nonexistent contact.
    const { count: contactCount, error: contactErr } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .in("id", body.contact_ids);

    if (contactErr) {
      console.error("[qr-broadcast] contacts ownership check error:", contactErr.message);
      return NextResponse.json(
        { error: "Could not verify contact ownership." },
        { status: 500 },
      );
    }

    const uniqueRequestedCount = new Set(body.contact_ids).size;
    if ((contactCount ?? 0) < uniqueRequestedCount) {
      return NextResponse.json(
        {
          error:
            "One or more contact_ids do not exist in this workspace or belong to another account.",
        },
        { status: 400 },
      );
    }

    // 7. Build broadcast name.
    const broadcastName =
      body.name ||
      `QR Broadcast ${new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`;

    // 8. Call the atomic Postgres RPC via service-role client.
    //    The RPC:
    //      a) deduplicates contact IDs
    //      b) snapshots phone numbers from contacts table
    //      c) inserts broadcasts row
    //      d) inserts broadcast_recipients rows
    //      e) inserts whatsapp_message_outbox rows with DETERMINISTIC keys
    //      f) updates total_recipients with real count
    //    All in one transaction — partial state is impossible.
    const admin = supabaseAdmin();
    const { data: rpcData, error: rpcError } = await admin.rpc(
      "create_qr_broadcast_with_recipients",
      {
        p_account_id: accountId,
        p_user_id: userId,
        p_name: broadcastName,
        p_whatsapp_account_id: qrAccount.id,
        p_message_text: body.message_text,
        p_contact_ids: body.contact_ids,
        p_scheduled_at: body.scheduled_at ?? null,
        p_send_interval_ms: body.send_interval_ms ?? 1000,
        p_media_url: body.media_url ?? null,
        p_media_type: body.media_type ?? null,
        p_media_filename: body.media_filename ?? null,
        p_media_mimetype: body.media_mimetype ?? null,
      },
    );

    if (rpcError) {
      console.error("[qr-broadcast] RPC error:", rpcError.message, rpcError.details, rpcError.hint);
      // Classify the error so the client sees something actionable.
      const msg = rpcError.message ?? ''
      let clientError = "Failed to create broadcast. Please try again."
      if (msg.includes('does not exist') || msg.includes('undefined function')) {
        clientError = "Database setup incomplete — please apply migrations 091-093 to your Supabase project."
      } else if (msg.includes('permission denied') || msg.includes('not found')) {
        clientError = "Permission error: " + msg
      } else if (msg.includes('violates')) {
        clientError = "Database constraint error: " + msg
      } else if (process.env.NODE_ENV !== 'production') {
        // In development, surface the raw message to speed up debugging.
        clientError = msg
      }
      return NextResponse.json({ error: clientError }, { status: 500 });
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row?.broadcast_id) {
      console.error("[qr-broadcast] RPC returned no broadcast_id:", rpcData);
      return NextResponse.json(
        { error: "Broadcast created but ID not returned — contact support." },
        { status: 500 },
      );
    }

    // 9. Return immediately — worker processes outbox jobs asynchronously.
    // Phase G: report 'scheduled' when the send time is meaningfully in the future.
    const isScheduled =
      body.scheduled_at != null &&
      new Date(body.scheduled_at).getTime() > Date.now() + 30_000;

    return NextResponse.json({
      success: true,
      broadcastId: row.broadcast_id as string,
      totalRecipients: (row.recipient_count as number) ?? 0,
      status: isScheduled ? "scheduled" : "queued",
    });
  } catch (error) {
    console.error("[qr-broadcast] unhandled error:", error instanceof Error ? error.message : error);
    return toErrorResponse(error);
  }
}
