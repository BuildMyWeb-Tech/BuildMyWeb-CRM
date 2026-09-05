import { NextResponse } from 'next/server'
import { requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// POST /api/client-leads/[id]/tasks — add one checklist item to a lead.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params
  let ctx
  try {
    // Task mutations go through the RLS-scoped client below (not
    // supabaseAdmin), so the fallback floor here must match
    // client_lead_tasks' RLS policy ('agent'), not the looser
    // 'employee' floor the parent lead's own fields use.
    ctx = await requirePagePermission('client_leads', 'update', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const { count } = await ctx.supabase
    .from('client_lead_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId)

  const { data: task, error } = await ctx.supabase
    .from('client_lead_tasks')
    .insert({
      account_id: ctx.accountId,
      lead_id: leadId,
      title,
      position: count ?? 0,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[client-lead-tasks] create failed:', error)
    return NextResponse.json({ error: 'Could not add task' }, { status: 500 })
  }

  return NextResponse.json({ task }, { status: 201 })
}
