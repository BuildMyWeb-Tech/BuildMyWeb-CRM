import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

const DEFAULT_STAGES = [
  { name: 'To Do', color: '#94a3b8' },
  { name: 'In Progress', color: '#60a5fa' },
  { name: 'Review', color: '#facc15' },
  { name: 'Done', color: '#22c55e' },
  { name: 'Hold', color: '#f59e0b' },
  { name: 'Waiting on Client', color: '#a855f7' },
]

// ============================================================
// GET /api/projects — list projects for the caller's account.
// POST /api/projects — create a project. Creates its backing
//   `pipelines` row + 4 default stages (To Do/In Progress/Review/
//   Done) in the same call, so a board exists immediately. Columns
//   are fully editable afterward (rename/reorder/add/delete) via
//   the BoardSettings component (src/components/projects/
//   board-settings.tsx), which writes directly to `pipeline_stages`
//   through the RLS-scoped Supabase client — same pattern as Sales'
//   PipelineSettings, no dedicated API route needed since RLS
//   already enforces agent+ access.
// ============================================================

// Self-heals a gap from before this was reliable: POST /api/clients'
// auto-project-creation is best-effort (see its comment), so a client
// created while that step failed — or predating it entirely — has no
// project row and silently never appears on any board or the Overview
// side panel. Runs on every list load (cheap: a handful of rows per
// account) rather than as a one-off backfill, so it self-corrects
// going forward too, not just for today's gap.
async function backfillMissingClientProjects(
  supabase: Awaited<ReturnType<typeof getCurrentAccount>>['supabase'],
  accountId: string,
  ownerUserId: string,
) {
  const { data: clients } = await supabase.from('clients').select('id, name, status').eq('account_id', accountId)
  if (!clients || clients.length === 0) return

  const { data: existingProjects } = await supabase.from('projects').select('client_id').eq('account_id', accountId)
  const clientIdsWithProject = new Set((existingProjects ?? []).map((p) => p.client_id).filter(Boolean))
  const orphanClients = clients.filter((c) => !clientIdsWithProject.has(c.id))
  if (orphanClients.length === 0) return

  for (const client of orphanClients) {
    const { data: pipeline, error: pipelineError } = await supabase
      .from('pipelines')
      .insert({ account_id: accountId, user_id: ownerUserId, name: `${client.name} Board` })
      .select('id')
      .single()
    if (pipelineError || !pipeline) {
      console.error('[projects] backfill pipeline creation failed for client', client.id, pipelineError)
      continue
    }
    const { error: stagesError } = await supabase.from('pipeline_stages').insert(
      DEFAULT_STAGES.map((s, i) => ({ pipeline_id: pipeline.id, name: s.name, position: i + 1, color: s.color })),
    )
    if (stagesError) {
      console.error('[projects] backfill stage seeding failed for client', client.id, stagesError)
      continue
    }
    const { error: projectError } = await supabase.from('projects').insert({
      account_id: accountId,
      pipeline_id: pipeline.id,
      client_id: client.id,
      name: client.name,
      status: client.status,
      owner_user_id: ownerUserId,
    })
    if (projectError) console.error('[projects] backfill project creation failed for client', client.id, projectError)
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const clientIdFilter = new URL(request.url).searchParams.get('client_id')

    if (ctx.userId) {
      await backfillMissingClientProjects(ctx.supabase, ctx.accountId, ctx.userId)
    }

    let query = ctx.supabase
      .from('projects')
      .select('*, contact:contacts(id, name, phone), pipeline:pipelines(id, name)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (clientIdFilter) query = query.eq('client_id', clientIdFilter)

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json({ projects: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const clientContactId = typeof body.client_contact_id === 'string' ? body.client_contact_id : null
  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() || null : null
  const description = typeof body.description === 'string' ? body.description : null
  const startDate = typeof body.start_date === 'string' ? body.start_date : null
  const dueDate = typeof body.due_date === 'string' ? body.due_date : null

  // 1. Create the board (a pipelines row, same table Sales uses).
  const { data: pipeline, error: pipelineError } = await ctx.supabase
    .from('pipelines')
    .insert({ account_id: ctx.accountId, user_id: ctx.userId, name: `${name} Board` })
    .select('id')
    .single()

  if (pipelineError || !pipeline) {
    console.error('[projects] pipeline creation failed:', pipelineError)
    return NextResponse.json({ error: 'Could not create the project board' }, { status: 500 })
  }

  // 2. Seed its 4 default columns — editable afterward, not fixed.
  const { error: stagesError } = await ctx.supabase.from('pipeline_stages').insert(
    DEFAULT_STAGES.map((s, i) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      position: i + 1,
      color: s.color,
    })),
  )
  if (stagesError) {
    console.error('[projects] stage seeding failed:', stagesError)
    return NextResponse.json({ error: 'Could not set up the board columns' }, { status: 500 })
  }

  // 3. Create the project itself, pointing at that board.
  const { data: project, error: projectError } = await ctx.supabase
    .from('projects')
    .insert({
      account_id: ctx.accountId,
      pipeline_id: pipeline.id,
      client_contact_id: clientContactId,
      client_name: clientName,
      name,
      description,
      owner_user_id: ctx.userId,
      start_date: startDate,
      due_date: dueDate,
    })
    .select('*, contact:contacts(id, name, phone), pipeline:pipelines(id, name)')
    .single()

  if (projectError) {
    console.error('[projects] project creation failed:', projectError)
    return NextResponse.json({ error: 'Could not create the project' }, { status: 500 })
  }

  return NextResponse.json({ project }, { status: 201 })
}