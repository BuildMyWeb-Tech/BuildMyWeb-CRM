import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

// GET /api/clients — list clients for this account.
// POST /api/clients — create a client. Only `name` is required —
// every other field is optional per BMW's call (multi-sector shop,
// not every client needs every field filled in at creation).

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('clients')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ clients: data ?? [] })
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

  const status = typeof body.status === 'string' && ['active', 'inactive', 'archived'].includes(body.status)
    ? body.status
    : 'active'

  const { data: client, error } = await ctx.supabase
    .from('clients')
    .insert({
      account_id: ctx.accountId,
      name,
      status,
      interface_name: typeof body.interface_name === 'string' ? body.interface_name : null,
      interface_contact_number:
        typeof body.interface_contact_number === 'string' ? body.interface_contact_number : null,
      accent_color: typeof body.accent_color === 'string' ? body.accent_color : null,
      client_since: typeof body.client_since === 'string' ? body.client_since : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[clients] create failed:', error)
    return NextResponse.json({ error: 'Could not create client' }, { status: 500 })
  }

  // Auto-create a linked project + its board, same 3-step pattern
  // POST /api/projects uses (pipeline -> stages -> row). Best-effort:
  // if this fails, the client itself was still created successfully —
  // log and continue rather than rolling back the client, since a
  // missing auto-project is recoverable (create one manually) but a
  // silently-vanished client the user just filled a form for is not.
  const { data: pipeline, error: pipelineError } = await ctx.supabase
    .from('pipelines')
    .insert({ account_id: ctx.accountId, user_id: ctx.userId, name: `${name} Board` })
    .select('id')
    .single()

  if (!pipelineError && pipeline) {
    const DEFAULT_STAGES = [
      { name: 'To Do', color: '#94a3b8' },
      { name: 'In Progress', color: '#60a5fa' },
      { name: 'Review', color: '#facc15' },
      { name: 'Done', color: '#22c55e' },
    ]
    const { error: stagesError } = await ctx.supabase.from('pipeline_stages').insert(
      DEFAULT_STAGES.map((s, i) => ({
        pipeline_id: pipeline.id,
        name: s.name,
        position: i + 1,
        color: s.color,
      })),
    )
    if (!stagesError) {
      const { error: projectError } = await ctx.supabase.from('projects').insert({
        account_id: ctx.accountId,
        pipeline_id: pipeline.id,
        client_id: client.id,
        name,
        status: status === 'archived' ? 'cancelled' : 'active',
        owner_user_id: ctx.userId,
      })
      if (projectError) console.error('[clients] auto-project creation failed:', projectError)
    } else {
      console.error('[clients] auto-project stage seeding failed:', stagesError)
    }
  } else {
    console.error('[clients] auto-project pipeline creation failed:', pipelineError)
  }

  return NextResponse.json({ client }, { status: 201 })
}
