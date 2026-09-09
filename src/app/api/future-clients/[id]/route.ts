import { NextResponse } from 'next/server'
import { requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// PATCH /api/future-clients/[id] — edit fields.
// DELETE /api/future-clients/[id] — remove (either "not interested" or
//   after manually converting to a real client via Client Directory).

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('future_clients', 'update', 'employee')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    update.title = title
  }
  if ('client_name' in body) update.client_name = typeof body.client_name === 'string' ? body.client_name.trim() || null : null
  if ('phone' in body) update.phone = typeof body.phone === 'string' ? body.phone.trim() || null : null
  if ('notes' in body) update.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await ctx.supabase
    .from('future_clients')
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
    ctx = await requirePagePermission('future_clients', 'delete', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await ctx.supabase
    .from('future_clients')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
