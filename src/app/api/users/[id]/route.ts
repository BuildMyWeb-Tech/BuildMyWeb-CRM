import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// PATCH /api/users/[id] — toggle active/inactive (bans/unbans at the
//   Supabase Auth level, not just a cosmetic flag — see
//   054_user_management.sql) or reset a password.
// DELETE /api/users/[id] — removes the auth user entirely (profile
//   row cascades).

export async function PATCH(
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
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const admin = supabaseAdmin()

  if (typeof body.is_active === 'boolean') {
    const { error: banError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: body.is_active ? 'none' : '876000h',
    })
    if (banError) return NextResponse.json({ error: banError.message }, { status: 500 })

    const { error: profileError } = await admin
      .from('profiles')
      .update({ is_active: body.is_active })
      .eq('user_id', id)
      .eq('account_id', ctx.accountId)
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    const { error: pwError } = await admin.auth.admin.updateUserById(id, { password: body.password })
    if (pwError) return NextResponse.json({ error: pwError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin().auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
