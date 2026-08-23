import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// POST /api/google-drive/disconnect — admin-only. Clears the stored
// tokens; does NOT revoke them on Google's side (Google doesn't
// require that, and the tokens become useless to us either way once
// deleted here — if you want them fully revoked on Google's end too,
// do that from myaccount.google.com/permissions on the connected
// account).

export async function POST() {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin().from('google_drive_config').delete().eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
