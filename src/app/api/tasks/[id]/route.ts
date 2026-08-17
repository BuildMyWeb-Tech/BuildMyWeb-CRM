import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// PATCH /api/tasks/[id] — edit a task, or move it to a different
//   stage/position (drag-and-drop on the board calls this with just
//   { stage_id, position }).
// DELETE /api/tasks/[id] — deletes the task. Attachments cascade via
//   ON DELETE CASCADE on task_attachments (metadata rows only — the
//   underlying Storage objects are NOT auto-deleted by Postgres and
//   should be cleaned up client-side before calling this, or accepted
//   as orphaned objects for now given the 20-60 leads/task scale
//   this is built for).

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
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
  if ('description' in body) update.description = body.description ?? null
  if ('assignee_user_id' in body) update.assignee_user_id = body.assignee_user_id ?? null
  if ('due_date' in body) update.due_date = body.due_date ?? null
  if ('checklist' in body && Array.isArray(body.checklist)) update.checklist = body.checklist
  if (typeof body.priority === 'string') {
    if (!['low', 'normal', 'high', 'urgent'].includes(body.priority)) {
      return NextResponse.json({ error: 'invalid priority' }, { status: 400 })
    }
    update.priority = body.priority
  }
  if (typeof body.stage_id === 'string') update.stage_id = body.stage_id
  if (typeof body.position === 'number') update.position = body.position

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin()
    .from('project_tasks')
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
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { error } = await supabaseAdmin()
    .from('project_tasks')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}