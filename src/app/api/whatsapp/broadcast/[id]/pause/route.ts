/**
 * POST /api/whatsapp/broadcast/[id]/pause
 *
 * Transitions a QR broadcast from 'sending' → 'paused'.
 * The worker checks isBroadcastEligibleToSend() before each job,
 * so in-flight jobs finish but no new jobs start after this call.
 *
 * Allowed transitions: sending → paused
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

    // Verify the broadcast belongs to this account and is a QR broadcast.
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
    if (bc["status"] !== "sending") {
      return NextResponse.json(
        { error: `Cannot pause a broadcast with status '${bc["status"]}'.` },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { error: updateErr } = await admin
      .from("broadcasts")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", broadcastId);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to pause broadcast." }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "paused" });
  } catch (err) {
    return toErrorResponse(err);
  }
}
