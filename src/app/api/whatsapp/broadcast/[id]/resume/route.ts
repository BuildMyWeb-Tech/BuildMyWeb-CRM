/**
 * POST /api/whatsapp/broadcast/[id]/resume
 *
 * Transitions a QR broadcast from 'paused' → 'sending'.
 * The worker will pick up any remaining pending outbox jobs on its next poll.
 *
 * Allowed transitions: paused → sending
 */

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

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
    const bc = broadcast as unknown as Record<string, unknown>
    if (bc["provider"] !== "qr") {
      return NextResponse.json(
        { error: "Pause/resume is only available for QR broadcasts." },
        { status: 400 },
      );
    }
    if (bc["status"] !== "paused") {
      return NextResponse.json(
        { error: `Cannot resume a broadcast with status '${bc["status"]}'.` },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { error: updateErr } = await admin
      .from("broadcasts")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", broadcastId);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to resume broadcast." }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "sending" });
  } catch (err) {
    return toErrorResponse(err);
  }
}
