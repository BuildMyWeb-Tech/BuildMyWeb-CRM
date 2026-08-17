import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/projects/[id] — project + its board (stages) + tasks +
//   each task's attachments, in one call for the board page.
// PATCH /api/projects/[id] — update project fields.
// DELETE /api/projects/[id] — deletes the project. The board
//   (pipeline_stages) and tasks cascade via ON DELETE CASCADE from
//   041_client_projects.sql; the pipeline row itself is left behind
//   intentionally (ON DELETE RESTRICT on projects.pipeline_id) so a
//   board with historical tasks isn't silently destroyed — delete
//   it separately from Pipeline settings if you really want it gone.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()

    const { data: project, error: projectError } = await ctx.supabase
      .from('projects')
      .select('*, contact:contacts(id, name, phone), pipeline:pipelines(id, name)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (projectError) throw projectError
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { data: stages, error: stagesError } = await ctx.supabase
      .from('pipeline_stages')
      .select('*')
      .eq('pipeline_id', project.pipeline_id)
      .order('position', { ascending: true })
    if (stagesError) throw stagesError

    const { data: tasks, error: tasksError } = await ctx.supabase
      .from('project_tasks')
      .select('*, attachments:task_attachments(*)')
      .eq('project_id', id)
      .order('position', { ascending: true })
    if (tasksError) throw tasksError

    return NextResponse.json({ project, stages: stages ?? [], tasks: tasks ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

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
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    update.name = name
  }
  if ('description' in body) update.description = body.description ?? null
  if ('client_contact_id' in body) update.client_contact_id = body.client_contact_id ?? null
  if ('client_name' in body) update.client_name = body.client_name ?? null
  if ('start_date' in body) update.start_date = body.start_date ?? null
  if ('due_date' in body) update.due_date = body.due_date ?? null
  if (typeof body.status === 'string') {
    if (!['active', 'on_hold', 'completed', 'cancelled'].includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    update.status = body.status
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin()
    .from('projects')
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
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}