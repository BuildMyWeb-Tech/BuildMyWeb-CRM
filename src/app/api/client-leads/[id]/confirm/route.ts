import { NextResponse } from 'next/server'
import { requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// POST /api/client-leads/[id]/confirm — moves a lead into Client
// Directory: creates a `clients` row (+ its auto-project/board, same
// 3-step pattern POST /api/clients uses) from the lead's fields,
// then deletes the lead. Requires create-on-client_directory as well
// as update-on-client_leads, since it's really "create a client,
// then remove the source lead" — not a plain lead edit.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('client_leads', 'update', 'employee')
    await requirePagePermission('client_directory', 'create', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { data: lead, error: leadError } = await ctx.supabase
    .from('client_leads')
    .select('*')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { data: client, error: clientError } = await ctx.supabase
    .from('clients')
    .insert({
      account_id: ctx.accountId,
      name: lead.title,
      interface_contact_number: lead.phone,
      notes: lead.notes,
      status: 'active',
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (clientError || !client) {
    console.error('[client-leads] confirm->client creation failed:', clientError)
    return NextResponse.json({ error: 'Could not create client from this lead' }, { status: 500 })
  }

  // Best-effort auto-project, same as POST /api/clients — a missing
  // board is recoverable (create one manually) but a lead that
  // vanished without becoming a client is not, so failures here are
  // logged, not surfaced as this request's failure.
  const { data: pipeline, error: pipelineError } = await ctx.supabase
    .from('pipelines')
    .insert({ account_id: ctx.accountId, user_id: ctx.userId, name: `${client.name} Board` })
    .select('id')
    .single()

  if (!pipelineError && pipeline) {
    const DEFAULT_STAGES = [
      { name: 'To Do', color: '#94a3b8' },
      { name: 'In Progress', color: '#60a5fa' },
      { name: 'Review', color: '#facc15' },
      { name: 'Done', color: '#22c55e' },
      { name: 'Hold', color: '#f59e0b' },
      { name: 'Waiting on Client', color: '#a855f7' },
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
        name: client.name,
        status: 'active',
        owner_user_id: ctx.userId,
      })
      if (projectError) console.error('[client-leads] confirm auto-project creation failed:', projectError)
    } else {
      console.error('[client-leads] confirm auto-project stage seeding failed:', stagesError)
    }
  } else {
    console.error('[client-leads] confirm auto-project pipeline creation failed:', pipelineError)
  }

  const { error: deleteError } = await ctx.supabase
    .from('client_leads')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (deleteError) console.error('[client-leads] confirm cleanup (lead delete) failed:', deleteError)

  return NextResponse.json({ client })
}
