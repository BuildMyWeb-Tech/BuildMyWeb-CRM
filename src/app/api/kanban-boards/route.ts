import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

const DEFAULT_STAGES = [
  { name: 'To Do', color: '#94a3b8' },
  { name: 'In Progress', color: '#60a5fa' },
  { name: 'Done', color: '#22c55e' },
]

// GET /api/kanban-boards — list standalone boards for this account.
// POST /api/kanban-boards — create a board + its backing pipeline +
//   3 default columns in one call. Same 3-step pattern as
//   POST /api/projects (pipeline -> stages -> the wrapper row).

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('kanban_boards')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ boards: data ?? [] })
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
  const description = typeof body.description === 'string' ? body.description : null

  const { data: pipeline, error: pipelineError } = await ctx.supabase
    .from('pipelines')
    .insert({ account_id: ctx.accountId, user_id: ctx.userId, name: `${name} Board` })
    .select('id')
    .single()

  if (pipelineError || !pipeline) {
    console.error('[kanban-boards] pipeline creation failed:', pipelineError)
    return NextResponse.json({ error: 'Could not create the board' }, { status: 500 })
  }

  const { error: stagesError } = await ctx.supabase.from('pipeline_stages').insert(
    DEFAULT_STAGES.map((s, i) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      position: i + 1,
      color: s.color,
    })),
  )
  if (stagesError) {
    console.error('[kanban-boards] stage seeding failed:', stagesError)
    return NextResponse.json({ error: 'Could not set up the board columns' }, { status: 500 })
  }

  const { data: board, error: boardError } = await ctx.supabase
    .from('kanban_boards')
    .insert({
      account_id: ctx.accountId,
      pipeline_id: pipeline.id,
      name,
      description,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (boardError) {
    console.error('[kanban-boards] board creation failed:', boardError)
    return NextResponse.json({ error: 'Could not create the board' }, { status: 500 })
  }

  return NextResponse.json({ board }, { status: 201 })
}
