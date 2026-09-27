/**
 * POST /api/whatsapp/broadcast/[id]/cancel
 *
 * Permanently cancels a QR broadcast.
 * Transitions: sending | paused | scheduled → cancelled
 *
 * Additionally moves any 'pending' outbox jobs for this broadcast
 * to 'cancelled' so the worker never sends them.
 * This is the only destructive state — it cannot be undone.
 */

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

const CANCELLABLE_STATUSES = new Set(["sending", "paused", "scheduled"]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: broadcastId } = await params;
    const { supabase, accountId } = await requireRole("agent");

    const { data: broadcast, error: fetchErr } = await supabase
      .from("broadcasts")
      .select("id, status, provider")
      .eq("id", broadcastId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: "Failed to fetch broadcast." }, { status: 500 });
    }
    if (!broadcast) {
      return NextResponse.json({ error: "Broadcast not found." }, { status: 404 });
    }
    if (broadcast.provider !== "qr") {
      return NextResponse.json(
        { error: "Cancel is only available for QR broadcasts." },
        { status: 400 },
      );
    }
    if (!CANCELLABLE_STATUSES.has(broadcast.status)) {
      return NextResponse.json(
        { error: `Cannot cancel a broadcast with status '${broadcast.status}'.` },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const now = new Date().toISOString();

    // 1. Cancel all pending outbox jobs atomically before updating broadcast status.
    //    This prevents a race where the worker claims a job between the two updates.
    const { error: outboxErr } = await admin
      .from("whatsapp_message_outbox")
      .update({ status: "cancelled", updated_at: now })
      .eq("broadcast_id", broadcastId)
      .eq("status", "pending");

    if (outboxErr) {
      return NextResponse.json(
        { error: "Failed to cancel pending outbox jobs." },
        { status: 500 },
      );
    }

    // 2. Mark broadcast as cancelled.
    const { error: updateErr } = await admin
      .from("broadcasts")
      .update({ status: "cancelled", updated_at: now })
      .eq("id", broadcastId);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to cancel broadcast." }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "cancelled" });
  } catch (err) {
    return toErrorResponse(err);
  }
}
