import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { PAGE_REGISTRY, type PagePermissionDraft } from '@/lib/permissions/page-registry'

// GET /api/users/[id]/permissions — the grid for one user. Own row
//   readable by the user themself too (RLS), admin can read anyone's.
// PUT /api/users/[id]/permissions — replace the whole grid in one
//   call (delete + bulk-insert is simpler and safer than diffing a
//   ~15-row grid client-side).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('user_page_permissions')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('user_id', id)
    if (error) throw error
    return NextResponse.json({ permissions: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const drafts: PagePermissionDraft[] = Array.isArray(body?.permissions) ? body.permissions : []
  const validKeys = new Set(PAGE_REGISTRY.map((p) => p.key))

  const rows = drafts
    .filter((d) => validKeys.has(d.page_key))
    .map((d) => ({
      account_id: ctx.accountId,
      user_id: id,
      page_key: d.page_key,
      can_create: !!d.can_create,
      can_read: !!d.can_read,
      can_update: !!d.can_update,
      can_delete: !!d.can_delete,
      can_print: !!d.can_print,
    }))

  const admin = supabaseAdmin()
  const { error: deleteError } = await admin
    .from('user_page_permissions')
    .delete()
    .eq('account_id', ctx.accountId)
    .eq('user_id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (rows.length > 0) {
    const { error: insertError } = await admin.from('user_page_permissions').insert(rows)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
