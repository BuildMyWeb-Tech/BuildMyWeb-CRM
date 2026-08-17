import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// POST /api/projects/[id]/tasks — create a task on this project's
// board. Defaults to the board's first stage (lowest position)
// unless stage_id is given, and to the end of that stage's current
// task list unless position is given.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: project, error: projectError } = await db
    .from('projects')
    .select('id, pipeline_id')
    .eq('id', projectId)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  let stageId = typeof body.stage_id === 'string' ? body.stage_id : null
  if (!stageId) {
    const { data: firstStage } = await db
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', project.pipeline_id)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle()
    stageId = firstStage?.id ?? null
  }
  if (!stageId) {
    return NextResponse.json({ error: 'This project has no board columns yet' }, { status: 400 })
  }

  let position = typeof body.position === 'number' ? body.position : null
  if (position === null) {
    const { count } = await db
      .from('project_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('stage_id', stageId)
    position = count ?? 0
  }

  const { data: task, error: taskError } = await db
    .from('project_tasks')
    .insert({
      account_id: ctx.accountId,
      project_id: projectId,
      stage_id: stageId,
      title,
      description: typeof body.description === 'string' ? body.description : null,
      assignee_user_id: typeof body.assignee_user_id === 'string' ? body.assignee_user_id : null,
      priority: ['low', 'normal', 'high', 'urgent'].includes(body.priority) ? body.priority : 'normal',
      due_date: typeof body.due_date === 'string' ? body.due_date : null,
      checklist: Array.isArray(body.checklist) ? body.checklist : [],
      position,
    })
    .select('*')
    .single()

  if (taskError) {
    console.error('[projects/tasks] create failed:', taskError)
    return NextResponse.json({ error: 'Could not create task' }, { status: 500 })
  }

  return NextResponse.json({ task }, { status: 201 })
}