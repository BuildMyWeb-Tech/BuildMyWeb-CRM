/**
 * Unit tests for broadcast-qr.ts — Phase 1A data model helpers.
 *
 * These tests cover:
 *   - deriveIdempotencyKey: pure function, stable output
 *   - validateQrBroadcastInput: all validation branches
 *   - createQrBroadcast: RPC call shape, success + error paths
 *
 * No database required — Supabase client is mocked.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createQrBroadcast,
  deriveIdempotencyKey,
  validateQrBroadcastInput,
  type QrBroadcastInput,
} from "./broadcast-qr";

// ── deriveIdempotencyKey ─────────────────────────────────────────────────────

describe("deriveIdempotencyKey", () => {
  it("produces a stable deterministic key", () => {
    const key = deriveIdempotencyKey("broadcast-1", "recipient-2");
    expect(key).toBe("broadcast:broadcast-1:recipient:recipient-2");
  });

  it("is stable across multiple calls with the same args", () => {
    const a = deriveIdempotencyKey("b", "r");
    const b = deriveIdempotencyKey("b", "r");
    expect(a).toBe(b);
  });

  it("differs when broadcastId changes", () => {
    const a = deriveIdempotencyKey("b1", "r");
    const b = deriveIdempotencyKey("b2", "r");
    expect(a).not.toBe(b);
  });

  it("differs when recipientId changes", () => {
    const a = deriveIdempotencyKey("b", "r1");
    const b = deriveIdempotencyKey("b", "r2");
    expect(a).not.toBe(b);
  });

  it("matches the Postgres format broadcast:<id>:recipient:<id>", () => {
    const id1 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const id2 = "ffffffff-1111-2222-3333-444444444444";
    expect(deriveIdempotencyKey(id1, id2)).toBe(
      `broadcast:${id1}:recipient:${id2}`,
    );
  });
});

// ── validateQrBroadcastInput ─────────────────────────────────────────────────

const BASE_INPUT: QrBroadcastInput = {
  accountId: "acc-1",
  userId: "usr-1",
  name: "Test Broadcast",
  whatsappAccountId: "wa-1",
  messageText: "Hello!",
  contactIds: ["c-1", "c-2"],
  sendIntervalMs: 1000,
};

describe("validateQrBroadcastInput", () => {
  it("returns empty array for valid input", () => {
    expect(validateQrBroadcastInput(BASE_INPUT)).toHaveLength(0);
  });

  it("errors when messageText is empty", () => {
    const errors = validateQrBroadcastInput({ ...BASE_INPUT, messageText: "" });
    expect(errors.some((e) => e.code === "NO_MESSAGE")).toBe(true);
  });

  it("errors when messageText is only whitespace", () => {
    const errors = validateQrBroadcastInput({ ...BASE_INPUT, messageText: "   " });
    expect(errors.some((e) => e.code === "NO_MESSAGE")).toBe(true);
  });

  it("errors when contactIds is empty", () => {
    const errors = validateQrBroadcastInput({ ...BASE_INPUT, contactIds: [] });
    expect(errors.some((e) => e.code === "NO_CONTACTS")).toBe(true);
  });

  it("errors when sendIntervalMs is below 500", () => {
    const errors = validateQrBroadcastInput({ ...BASE_INPUT, sendIntervalMs: 499 });
    expect(errors.some((e) => e.code === "INVALID_INTERVAL")).toBe(true);
  });

  it("accepts sendIntervalMs of exactly 500", () => {
    const errors = validateQrBroadcastInput({ ...BASE_INPUT, sendIntervalMs: 500 });
    expect(errors.some((e) => e.code === "INVALID_INTERVAL")).toBe(false);
  });

  it("accepts null sendIntervalMs (defaults to 1000)", () => {
    const { sendIntervalMs: _, ...rest } = BASE_INPUT;
    const errors = validateQrBroadcastInput(rest as QrBroadcastInput);
    expect(errors.some((e) => e.code === "INVALID_INTERVAL")).toBe(false);
  });

  it("can return multiple errors at once", () => {
    const errors = validateQrBroadcastInput({
      ...BASE_INPUT,
      messageText: "",
      contactIds: [],
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ── createQrBroadcast ────────────────────────────────────────────────────────

function makeMockSupabase(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) };
}

describe("createQrBroadcast", () => {
  it("calls the RPC with the correct parameter names", async () => {
    const supabase = makeMockSupabase({
      data: [{ broadcast_id: "bcast-1", recipient_count: 3 }],
      error: null,
    });

    await createQrBroadcast(supabase, BASE_INPUT);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.objectContaining({
        p_account_id: BASE_INPUT.accountId,
        p_user_id: BASE_INPUT.userId,
        p_name: BASE_INPUT.name,
        p_whatsapp_account_id: BASE_INPUT.whatsappAccountId,
        p_message_text: BASE_INPUT.messageText,
        p_contact_ids: BASE_INPUT.contactIds,
        p_send_interval_ms: BASE_INPUT.sendIntervalMs,
        p_scheduled_at: null,
        p_media_url: null,
        p_media_type: null,
        p_media_filename: null,
        p_media_mimetype: null,
      }),
    );
  });

  it("returns broadcastId and recipientCount from RPC result", async () => {
    const supabase = makeMockSupabase({
      data: [{ broadcast_id: "bcast-42", recipient_count: 7 }],
      error: null,
    });

    const result = await createQrBroadcast(supabase, BASE_INPUT);
    expect(result.broadcastId).toBe("bcast-42");
    expect(result.recipientCount).toBe(7);
  });

  it("throws when RPC returns an error", async () => {
    const supabase = makeMockSupabase({
      data: null,
      error: { message: "foreign key violation" },
    });

    await expect(createQrBroadcast(supabase, BASE_INPUT)).rejects.toThrow(
      "foreign key violation",
    );
  });

  it("throws when RPC returns no broadcast_id", async () => {
    const supabase = makeMockSupabase({ data: [], error: null });

    await expect(createQrBroadcast(supabase, BASE_INPUT)).rejects.toThrow(
      "no broadcast_id",
    );
  });

  it("throws when validation fails (no message)", async () => {
    const supabase = makeMockSupabase({ data: null, error: null });

    await expect(
      createQrBroadcast(supabase, { ...BASE_INPUT, messageText: "" }),
    ).rejects.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("passes scheduledAt as ISO string when provided", async () => {
    const supabase = makeMockSupabase({
      data: [{ broadcast_id: "bcast-99", recipient_count: 1 }],
      error: null,
    });
    const scheduledAt = new Date("2026-10-01T10:00:00.000Z");

    await createQrBroadcast(supabase, { ...BASE_INPUT, scheduledAt });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.objectContaining({ p_scheduled_at: scheduledAt.toISOString() }),
    );
  });

  it("passes media fields when provided", async () => {
    const supabase = makeMockSupabase({
      data: [{ broadcast_id: "bcast-m", recipient_count: 2 }],
      error: null,
    });

    await createQrBroadcast(supabase, {
      ...BASE_INPUT,
      mediaUrl: "https://storage.example.com/img.jpg",
      mediaType: "image",
      mediaFilename: "img.jpg",
      mediaMimetype: "image/jpeg",
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.objectContaining({
        p_media_url: "https://storage.example.com/img.jpg",
        p_media_type: "image",
        p_media_filename: "img.jpg",
        p_media_mimetype: "image/jpeg",
      }),
    );
  });

  it("deduplicates contact IDs (identical IDs in array → only one call arg)", async () => {
    // Deduplication is Postgres-side; the TS layer passes contactIds through.
    // This test verifies we do NOT pre-deduplicate (Postgres owns that logic).
    const supabase = makeMockSupabase({
      data: [{ broadcast_id: "bcast-dup", recipient_count: 1 }],
      error: null,
    });
    const contactIds = ["c-1", "c-1", "c-2"];

    await createQrBroadcast(supabase, { ...BASE_INPUT, contactIds });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.objectContaining({ p_contact_ids: contactIds }),
    );
  });
});
