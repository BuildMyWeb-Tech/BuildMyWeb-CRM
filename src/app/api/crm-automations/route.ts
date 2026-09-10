import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

const VALID_TRIGGERS = [
  'project_status_changed', 'task_status_changed', 'task_created', 'task_assigned',
  'task_overdue', 'enquiry_status_changed', 'enquiry_created', 'client_created', 'payment_received',
]

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('crm_automations')
      .select('*, creator:profiles!crm_automations_created_by_fkey(full_name)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ automations: data ?? [] })
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

  const triggerType = typeof body.trigger_type === 'string' ? body.trigger_type : ''
  if (!VALID_TRIGGERS.includes(triggerType)) {
    return NextResponse.json({ error: 'Invalid trigger_type' }, { status: 400 })
  }

  const { data, error } = await ctx.supabase
    .from('crm_automations')
    .insert({
      account_id: ctx.accountId,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      trigger_type: triggerType,
      trigger_config: body.trigger_config && typeof body.trigger_config === 'object' ? body.trigger_config : {},
      conditions: Array.isArray(body.conditions) ? body.conditions : [],
      actions: Array.isArray(body.actions) ? body.actions : [],
      is_active: body.is_active !== false,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[crm-automations] create failed:', error)
    return NextResponse.json({ error: 'Could not create automation' }, { status: 500 })
  }

  return NextResponse.json({ automation: data }, { status: 201 })
}
