import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

const VALID_TRIGGERS = [
  'project_status_changed', 'task_status_changed', 'task_created', 'task_assigned',
  'task_overdue', 'enquiry_status_changed', 'enquiry_created', 'client_created', 'payment_received',
]

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentAccount()
    const { id } = await params
    const { data, error } = await ctx.supabase
      .from('crm_automations')
      .select('*, creator:profiles!crm_automations_created_by_fkey(full_name), logs:crm_automation_logs(id, status, created_at, trigger_data, actions_taken, error_message)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .single()
    if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ automation: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string') update.name = body.name.trim()
  if (typeof body.description === 'string') update.description = body.description
  if (typeof body.trigger_type === 'string') {
    if (!VALID_TRIGGERS.includes(body.trigger_type)) return NextResponse.json({ error: 'Invalid trigger_type' }, { status: 400 })
    update.trigger_type = body.trigger_type
  }
  if (body.trigger_config) update.trigger_config = body.trigger_config
  if (Array.isArray(body.conditions)) update.conditions = body.conditions
  if (Array.isArray(body.actions)) update.actions = body.actions
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active

  const { error } = await ctx.supabase
    .from('crm_automations')
    .update(update)
    .eq('id', id)
    .eq('account_id', ctx.accountId)

  if (error) return NextResponse.json({ error: 'Could not update' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { id } = await params
  const { error } = await ctx.supabase
    .from('crm_automations')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)

  if (error) return NextResponse.json({ error: 'Could not delete' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
