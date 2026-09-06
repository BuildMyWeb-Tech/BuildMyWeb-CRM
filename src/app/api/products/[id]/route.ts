import { NextResponse } from 'next/server'
import { requirePagePermission, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// PATCH /api/products/[id] — update fields.
// DELETE /api/products/[id] — agent+ only.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('products', 'update', 'employee')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.project_name === 'string') {
    const name = body.project_name.trim()
    if (!name) return NextResponse.json({ error: 'project_name cannot be empty' }, { status: 400 })
    update.project_name = name
  }
  if ('purpose' in body) update.purpose = typeof body.purpose === 'string' ? body.purpose.trim() || null : null
  if ('project_url_1' in body) update.project_url_1 = typeof body.project_url_1 === 'string' ? body.project_url_1.trim() || null : null
  if ('project_url_2' in body) update.project_url_2 = typeof body.project_url_2 === 'string' ? body.project_url_2.trim() || null : null
  if ('tech_stack' in body) update.tech_stack = typeof body.tech_stack === 'string' ? body.tech_stack.trim() || null : null

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin()
    .from('products')
    .update(update)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('products', 'delete', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin()
    .from('products')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
