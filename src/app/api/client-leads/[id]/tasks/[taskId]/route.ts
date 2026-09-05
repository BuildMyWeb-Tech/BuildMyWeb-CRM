import { NextResponse } from 'next/server'
import { requirePagePermission, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// PATCH /api/client-leads/[id]/tasks/[taskId] — toggle done / rename.
// DELETE /api/client-leads/[id]/tasks/[taskId] — remove a checklist item.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: leadId, taskId } = await params
  let ctx
  try {
    ctx = await requirePagePermission('client_leads', 'update', 'employee')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.is_done === 'boolean') update.is_done = body.is_done
  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    update.title = title
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin()
    .from('client_lead_tasks')
    .update(update)
    .eq('id', taskId)
    .eq('lead_id', leadId)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id: leadId, taskId } = await params
  let ctx
  try {
    ctx = await requirePagePermission('client_leads', 'update', 'employee')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin()
    .from('client_lead_tasks')
    .delete()
    .eq('id', taskId)
    .eq('lead_id', leadId)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
