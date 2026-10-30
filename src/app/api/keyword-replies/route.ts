import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// keyword_auto_replies stored in account_settings JSONB for simplicity
// Structure: { keyword_replies: Array<{ id, keyword, match_type, reply, is_active, created_at }> }

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) return NextResponse.json({ error: "Missing account_id" }, { status: 400 });
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("account_settings")
    .select("keyword_replies")
    .eq("account_id", accountId)
    .maybeSingle();
  return NextResponse.json({ rules: (data?.keyword_replies ?? []) as unknown[] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.account_id || !body?.keyword || !body?.reply) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("account_settings")
    .select("keyword_replies")
    .eq("account_id", body.account_id)
    .maybeSingle();

  const rules: unknown[] = (existing?.keyword_replies ?? []) as unknown[];
  const newRule = {
    id: crypto.randomUUID(),
    keyword: String(body.keyword).toLowerCase().trim(),
    match_type: body.match_type ?? "contains",
    reply: String(body.reply).trim(),
    is_active: true,
    created_at: new Date().toISOString(),
  };
  rules.push(newRule);

  await supabase
    .from("account_settings")
    .upsert({ account_id: body.account_id, keyword_replies: rules }, { onConflict: "account_id" });

  return NextResponse.json({ rule: newRule });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.account_id || !body?.id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("account_settings")
    .select("keyword_replies")
    .eq("account_id", body.account_id)
    .maybeSingle();

  const rules = ((existing?.keyword_replies ?? []) as { id: string }[]).filter((r) => r.id !== body.id);
  await supabase
    .from("account_settings")
    .upsert({ account_id: body.account_id, keyword_replies: rules }, { onConflict: "account_id" });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.account_id || !body?.id) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("account_settings")
    .select("keyword_replies")
    .eq("account_id", body.account_id)
    .maybeSingle();

  const rules = ((existing?.keyword_replies ?? []) as { id: string; is_active: boolean }[]).map((r) =>
    r.id === body.id ? { ...r, ...body.updates } : r,
  );
  await supabase
    .from("account_settings")
    .upsert({ account_id: body.account_id, keyword_replies: rules }, { onConflict: "account_id" });

  return NextResponse.json({ ok: true });
}
