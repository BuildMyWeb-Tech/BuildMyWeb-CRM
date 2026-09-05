import { NextResponse } from 'next/server'
import { getCurrentAccount, requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// GET /api/client-leads — list leads + their task checklists for this account.
// POST /api/client-leads — create a lead. Only `title` is required.

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('client_leads')
      .select('*, tasks:client_lead_tasks(*)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
    if (error) throw error

    // Sort each lead's tasks by position client-side — Supabase's
    // embedded-resource select doesn't support ordering the nested
    // collection itself.
    const leads = (data ?? []).map((lead) => ({
      ...lead,
      tasks: (lead.tasks ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position),
    }))

    return NextResponse.json({ leads })
  } catch (err) {
    return toErrorResponse(err)
  }
}

const PRIORITIES = ['low', 'medium', 'high']
const SOURCES = ['referral', 'website', 'cold_call', 'social_media', 'advertisement', 'other']

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requirePagePermission('client_leads', 'create', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const priority = typeof body.priority === 'string' && PRIORITIES.includes(body.priority) ? body.priority : 'medium'
  const source = typeof body.source === 'string' && SOURCES.includes(body.source) ? body.source : null

  const { data: lead, error } = await ctx.supabase
    .from('client_leads')
    .insert({
      account_id: ctx.accountId,
      title,
      phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      priority,
      source,
      next_follow_up_at: typeof body.next_follow_up_at === 'string' ? body.next_follow_up_at : null,
      allocated_user_id: typeof body.allocated_user_id === 'string' ? body.allocated_user_id : null,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[client-leads] create failed:', error)
    return NextResponse.json({ error: 'Could not create lead' }, { status: 500 })
  }

  return NextResponse.json({ lead: { ...lead, tasks: [] } }, { status: 201 })
}
