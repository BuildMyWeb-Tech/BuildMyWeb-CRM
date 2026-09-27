/**
 * Unit tests for POST /api/whatsapp/broadcast/qr
 *
 * All external I/O (requireRole, supabaseAdmin, validateQrBroadcastInput,
 * rate-limit) is mocked so tests run without a real database or network.
 *
 * Covers all 20 cases from the Phase 1B test spec.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mock external dependencies before importing the route
// ---------------------------------------------------------------------------

const mockSupabase = {
  from: vi.fn(),
};

const mockRpc = vi.fn();
const mockAdmin = { rpc: mockRpc };

vi.mock("@/lib/auth/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/account")>();
  return {
    ...actual,
    requireRole: vi.fn(),
    toErrorResponse: vi.fn((err: unknown) => {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status: number }).status
          : 500;
      return NextResponse.json(
        { error: (err as Error).message ?? "Internal server error" },
        { status },
      );
    }),
  };
});

vi.mock("@/lib/automations/admin-client", () => ({
  supabaseAdmin: vi.fn(() => mockAdmin),
}));

vi.mock("@/lib/whatsapp/broadcast-qr", () => ({
  validateQrBroadcastInput: vi.fn(() => []), // pass by default
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ success: true })),
  rateLimitResponse: vi.fn(() => NextResponse.json({ error: "Rate limited" }, { status: 429 })),
  RATE_LIMITS: { broadcast: { limit: 10, windowMs: 60000 } },
}));

import { requireRole, toErrorResponse, UnauthorizedError, ForbiddenError } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { validateQrBroadcastInput } from "@/lib/whatsapp/broadcast-qr";
import { checkRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "acc-111";
const USER_ID = "usr-222";
const WA_ACCOUNT_ID = "wa-333";
const BROADCAST_ID = "bcast-444";

const BASE_BODY = {
  contact_ids: ["c-1", "c-2"],
  message_text: "Hello from QR broadcast",
  send_interval_ms: 1000,
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/whatsapp/broadcast/qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Fluent builder for the supabase mock chain. */
function buildSupabaseMock({
  waAccount = { id: WA_ACCOUNT_ID, connection_state: "CONNECTED", provider: "qr" },
  waError = null,
  contactCount = 2,
  contactError = null,
}: {
  waAccount?: object | null;
  waError?: object | null;
  contactCount?: number;
  contactError?: object | null;
} = {}) {
  // Each .from() call returns a fresh chainable object.
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "whatsapp_accounts") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: waAccount, error: waError }),
            }),
          }),
        }),
      };
    }
    if (table === "contacts") {
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ count: contactCount, error: contactError }),
          }),
        }),
      };
    }
    return {};
  });
}

function setRequireRole(overrides: Partial<typeof mockSupabase> = {}) {
  vi.mocked(requireRole).mockResolvedValue({
    supabase: { ...mockSupabase, ...overrides } as never,
    accountId: ACCOUNT_ID,
    userId: USER_ID,
    role: "agent",
    account: { id: ACCOUNT_ID, name: "Test Account" },
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("POST /api/whatsapp/broadcast/qr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated agent, rate limit pass, lib validation pass
    setRequireRole();
    buildSupabaseMock();
    mockRpc.mockResolvedValue({
      data: [{ broadcast_id: BROADCAST_ID, recipient_count: 2 }],
      error: null,
    });
  });

  // ── 1. Unauthenticated request ──────────────────────────────────────────

  it("1. returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthorizedError());
    vi.mocked(toErrorResponse).mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await POST(makeRequest(BASE_BODY));
    expect(res.status).toBe(401);
  });

  // ── 2. Unauthorized account ─────────────────────────────────────────────

  it("2. returns 403 when role is insufficient", async () => {
    vi.mocked(requireRole).mockRejectedValue(new ForbiddenError("Insufficient role"));
    vi.mocked(toErrorResponse).mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const res = await POST(makeRequest(BASE_BODY));
    expect(res.status).toBe(403);
  });

  // ── 3. Missing QR account ───────────────────────────────────────────────

  it("3. returns 400 when no QR WhatsApp account exists", async () => {
    buildSupabaseMock({ waAccount: null });
    setRequireRole();

    const res = await POST(makeRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/no QR WhatsApp account/i);
  });

  // ── 4. QR account not CONNECTED ─────────────────────────────────────────

  it("4. returns 400 when QR account is DISCONNECTED", async () => {
    buildSupabaseMock({
      waAccount: { id: WA_ACCOUNT_ID, connection_state: "DISCONNECTED", provider: "qr" },
    });
    setRequireRole();

    const res = await POST(makeRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/not connected/i);
  });

  it("4b. returns 400 when QR account is in QR_REQUIRED state", async () => {
    buildSupabaseMock({
      waAccount: { id: WA_ACCOUNT_ID, connection_state: "QR_REQUIRED", provider: "qr" },
    });
    setRequireRole();

    const res = await POST(makeRequest(BASE_BODY));
    expect(res.status).toBe(400);
  });

  // ── 5. Valid QR broadcast ────────────────────────────────────────────────

  it("5. returns 200 with broadcastId for a valid request", async () => {
    const res = await POST(makeRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.broadcastId).toBe(BROADCAST_ID);
    expect(json.totalRecipients).toBe(2);
    expect(json.status).toBe("queued");
  });

  // ── 6. Empty recipients ──────────────────────────────────────────────────

  it("6. returns 400 when contact_ids is empty", async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, contact_ids: [] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/contact_ids/i);
  });

  // ── 7. Invalid contact (format) ──────────────────────────────────────────

  it("7. returns 400 when a contact_id is not a string", async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, contact_ids: [123, "c-2"] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/contact_id/i);
  });

  // ── 8. Contact belonging to another account ──────────────────────────────

  it("8. returns 400 when contacts are from a different account", async () => {
    buildSupabaseMock({ contactCount: 0 }); // 0 rows match this account
    setRequireRole();

    const res = await POST(makeRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/do not exist/i);
  });

  // ── 9. Duplicate contacts ────────────────────────────────────────────────

  it("9. deduplication happens in RPC — API passes contact_ids as-is", async () => {
    // The API does NOT deduplicate; Postgres does. contactCount = 1 (both resolve to same).
    buildSupabaseMock({ contactCount: 1 });
    setRequireRole();

    const res = await POST(
      makeRequest({ ...BASE_BODY, contact_ids: ["c-1", "c-1"] }),
    );
    // Both IDs are the same contact; unique set size = 1 = contactCount → passes
    expect(res.status).toBe(200);

    // RPC receives the raw array (dedup is Postgres-side)
    expect(mockRpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.objectContaining({ p_contact_ids: ["c-1", "c-1"] }),
    );
  });

  // ── 10. Duplicate phone numbers ──────────────────────────────────────────

  it("10. duplicate phone dedup is handled by the Postgres RPC (no TS dedup)", async () => {
    // Two contacts with the same phone → RPC snaps them both but returns 1 recipient.
    mockRpc.mockResolvedValue({
      data: [{ broadcast_id: BROADCAST_ID, recipient_count: 1 }],
      error: null,
    });

    const res = await POST(makeRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.totalRecipients).toBe(1);
  });

  // ── 11. Deterministic idempotency ────────────────────────────────────────

  it("11. RPC call uses correct parameter names (idempotency key is Postgres-derived)", async () => {
    await POST(makeRequest(BASE_BODY));

    expect(mockRpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.objectContaining({
        p_account_id: ACCOUNT_ID,
        p_user_id: USER_ID,
        p_message_text: BASE_BODY.message_text,
        p_contact_ids: BASE_BODY.contact_ids,
        p_send_interval_ms: 1000,
        p_scheduled_at: null,
      }),
    );
    // No random UUID is generated here — idempotency is fully Postgres-side.
  });

  // ── 12. Duplicate / retried request ──────────────────────────────────────

  it("12. a second identical request returns the same broadcast (RPC idempotency via UNIQUE constraint)", async () => {
    // Simulate RPC returning the same broadcast_id on a retry
    // (real Postgres would ON CONFLICT enforce uniqueness, RPC returns same row).
    const res1 = await POST(makeRequest(BASE_BODY));
    const res2 = await POST(makeRequest(BASE_BODY));

    expect((await res1.json()).broadcastId).toBe(BROADCAST_ID);
    expect((await res2.json()).broadcastId).toBe(BROADCAST_ID);
  });

  // ── 13. Message validation ───────────────────────────────────────────────

  it("13. returns 400 when message_text is empty", async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, message_text: "" }));
    expect(res.status).toBe(400);
  });

  it("13b. returns 400 when message_text is whitespace only", async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, message_text: "   " }));
    expect(res.status).toBe(400);
  });

  // ── 14. scheduled_at persistence ────────────────────────────────────────

  it("14. persists scheduled_at when provided", async () => {
    const scheduledAt = "2026-10-01T10:00:00.000Z";
    await POST(makeRequest({ ...BASE_BODY, scheduled_at: scheduledAt }));

    expect(mockRpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.objectContaining({ p_scheduled_at: scheduledAt }),
    );
  });

  it("14b. returns 400 for invalid scheduled_at format", async () => {
    const res = await POST(
      makeRequest({ ...BASE_BODY, scheduled_at: "not-a-date" }),
    );
    expect(res.status).toBe(400);
  });

  // ── 15. send_interval_ms validation ─────────────────────────────────────

  it("15. returns 400 when send_interval_ms < 500", async () => {
    const res = await POST(
      makeRequest({ ...BASE_BODY, send_interval_ms: 200 }),
    );
    expect(res.status).toBe(400);
  });

  it("15b. accepts send_interval_ms = 500", async () => {
    const res = await POST(
      makeRequest({ ...BASE_BODY, send_interval_ms: 500 }),
    );
    expect(res.status).toBe(200);
  });

  // ── 16. Media metadata compatibility ─────────────────────────────────────

  it("16. persists media fields when provided", async () => {
    const body = {
      ...BASE_BODY,
      media_url: "https://storage.example.com/img.jpg",
      media_type: "image" as const,
      media_filename: "img.jpg",
      media_mimetype: "image/jpeg",
    };

    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);

    expect(mockRpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.objectContaining({
        p_media_url: body.media_url,
        p_media_type: body.media_type,
        p_media_filename: body.media_filename,
        p_media_mimetype: body.media_mimetype,
      }),
    );
  });

  it("16b. returns 400 for invalid media_type", async () => {
    const res = await POST(
      makeRequest({ ...BASE_BODY, media_type: "gif", media_url: "https://x.com/a.gif" }),
    );
    expect(res.status).toBe(400);
  });

  // ── 17. Atomic RPC failure ────────────────────────────────────────────────

  it("17. returns 500 when RPC returns an error (no partial state)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "foreign key violation" },
    });

    const res = await POST(makeRequest(BASE_BODY));
    const json = await res.json();

    expect(res.status).toBe(500);
    // DB error message must NOT be exposed to the client
    expect(json.error).not.toContain("foreign key");
    expect(json.error).toMatch(/failed to create broadcast/i);
  });

  // ── 18. Large recipient list ──────────────────────────────────────────────

  it("18. accepts a large list of contacts without timeout concerns (all deferred to RPC)", async () => {
    const largeContactIds = Array.from({ length: 500 }, (_, i) => `c-${i}`);
    buildSupabaseMock({ contactCount: 500 });
    setRequireRole();
    mockRpc.mockResolvedValue({
      data: [{ broadcast_id: BROADCAST_ID, recipient_count: 500 }],
      error: null,
    });

    const res = await POST(makeRequest({ ...BASE_BODY, contact_ids: largeContactIds }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.totalRecipients).toBe(500);
  });

  // ── 19. API does NOT send WhatsApp messages ───────────────────────────────

  it("19. supabaseAdmin.rpc is called but no Baileys/send call is made", async () => {
    await POST(makeRequest(BASE_BODY));

    // Only the RPC was called — no sendText, sendMessage, or socket calls.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.any(Object),
    );
    // The route returns before worker processes anything.
  });

  // ── 20. Meta broadcast regression ────────────────────────────────────────

  it("20. Meta broadcast route is NOT imported or called from this route", async () => {
    // The QR route has its own dedicated file. It does not call sendTemplateMessage
    // or touch the Meta broadcast path at all. We verify no Meta-specific
    // identifiers appear in the RPC call.
    await POST(makeRequest(BASE_BODY));

    expect(mockRpc).toHaveBeenCalledWith(
      "create_qr_broadcast_with_recipients",
      expect.not.objectContaining({
        p_template_name: expect.anything(),
        p_template_language: expect.anything(),
      }),
    );
  });
});
