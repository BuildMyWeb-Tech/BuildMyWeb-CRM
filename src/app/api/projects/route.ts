import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

const DEFAULT_STAGES = [
  { name: 'To Do', color: '#94a3b8' },
  { name: 'In Progress', color: '#60a5fa' },
  { name: 'Review', color: '#facc15' },
  { name: 'Done', color: '#22c55e' },
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

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('projects')
      .select('*, contact:contacts(id, name, phone), pipeline:pipelines(id, name)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

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