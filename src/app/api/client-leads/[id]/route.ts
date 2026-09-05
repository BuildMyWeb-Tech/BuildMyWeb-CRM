import { NextResponse } from 'next/server'
import { requirePagePermission, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// PATCH /api/client-leads/[id] — update fields, including moving to
//   'hold' or back to 'in_discussion'. Use the dedicated
//   /confirm route to move a lead into Client Directory — that path
//   also creates the client + project rows, which a bare status
//   flip here can't do.
// DELETE /api/client-leads/[id] — reject (or just remove) a lead.

const PRIORITIES = ['low', 'medium', 'high']
const STATUSES = ['in_discussion', 'hold', 'confirmed', 'rejected']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('client_leads', 'update', 'employee')
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
  if ('phone' in body) update.phone = typeof body.phone === 'string' ? body.phone.trim() || null : null
  if ('notes' in body) update.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
  if ('next_follow_up_at' in body) update.next_follow_up_at = body.next_follow_up_at ?? null
  if ('allocated_user_id' in body) update.allocated_user_id = body.allocated_user_id ?? null
  if (typeof body.priority === 'string') {
    if (!PRIORITIES.includes(body.priority)) return NextResponse.json({ error: 'invalid priority' }, { status: 400 })
    update.priority = body.priority
  }
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status) || body.status === 'confirmed') {
      // 'confirmed' must go through /confirm — it needs to create a
      // client row too, which this route has no way to do atomically.
      return NextResponse.json({ error: 'invalid status — use /confirm to move a lead to Client Directory' }, { status: 400 })
    }
    update.status = body.status
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin()
    .from('client_leads')
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
    ctx = await requirePagePermission('client_leads', 'delete', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin()
    .from('client_leads')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
