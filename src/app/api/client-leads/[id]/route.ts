import { NextResponse } from 'next/server'
import { getCurrentAccount, requirePagePermission, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { logServerActivity } from '@/lib/activity/log-server'

// GET /api/client-leads/[id] — one lead + its task checklist, for the
//   detail page (/client-leads/[id]).
// PATCH /api/client-leads/[id] — update fields, including moving to
//   'hold' or back to 'in_discussion'. Use the dedicated
//   /confirm route to move a lead into Client Directory — that path
//   also creates the client + project rows, which a bare status
//   flip here can't do.
// DELETE /api/client-leads/[id] — reject (or just remove) a lead.

const PRIORITIES = ['low', 'medium', 'high']
const SOURCES = ['referral', 'website', 'cold_call', 'social_media', 'advertisement', 'other']
const STATUSES = ['in_discussion', 'hold', 'confirmed', 'rejected']

type LeadRow = Record<string, unknown>

function fmtDate(v: unknown): string {
  if (!v || typeof v !== 'string') return 'not set'
  return new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// Human-readable "what changed" for the activity log — before→after on
// the fields a person actually recognizes, not a dump of every DB
// column touched (follow_up_notified_at is a side-effect reset, not
// something anyone "changed"; allocated_user_id just mirrors
// allocated_user_ids' first entry). Returns "" when nothing worth
// reporting changed (e.g. only the side-effect field did).
function describeLeadUpdate(before: LeadRow, update: Record<string, unknown>): string {
  const parts: string[] = []
  if ('title' in update && update.title !== before.title) {
    parts.push(`title "${before.title}" → "${update.title}"`)
  }
  if ('status' in update && update.status !== before.status) {
    parts.push(`status ${before.status} → ${update.status}`)
  }
  if ('priority' in update && update.priority !== before.priority) {
    parts.push(`priority ${before.priority} → ${update.priority}`)
  }
  if ('next_follow_up_at' in update && update.next_follow_up_at !== before.next_follow_up_at) {
    parts.push(`follow-up ${fmtDate(before.next_follow_up_at)} → ${fmtDate(update.next_follow_up_at)}`)
  }
  if ('allocated_user_ids' in update) {
    const beforeIds = JSON.stringify([...((before.allocated_user_ids as string[]) ?? [])].sort())
    const afterIds = JSON.stringify([...((update.allocated_user_ids as string[]) ?? [])].sort())
    if (beforeIds !== afterIds) parts.push('assignees changed')
  }
  if ('phone' in update && update.phone !== before.phone) parts.push('phone updated')
  if ('notes' in update && update.notes !== before.notes) parts.push('notes updated')
  if ('source' in update && update.source !== before.source) parts.push('source updated')
  return parts.length > 0 ? `Updated enquiry "${before.title}" — ${parts.join(', ')}` : ''
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const { data: lead, error } = await ctx.supabase
      .from('client_leads')
      .select('*, tasks:client_lead_tasks(*)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) throw error
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    lead.tasks = (lead.tasks ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position)

    return NextResponse.json({ lead })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('client_leads', 'update', 'employee')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    update.title = title
  }
  if ('phone' in body) update.phone = typeof body.phone === 'string' ? body.phone.trim() || null : null
  if ('notes' in body) update.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
  if ('next_follow_up_at' in body) {
    update.next_follow_up_at = body.next_follow_up_at ?? null
    // Re-arm the reminder whenever the due time itself changes — see
    // 059_client_leads_extras.sql's note on how the cron route reads
    // this column.
    update.follow_up_notified_at = null
  }
  if ('next_follow_up_has_time' in body) update.next_follow_up_has_time = body.next_follow_up_has_time !== false
  if ('allocated_user_id' in body) update.allocated_user_id = body.allocated_user_id ?? null
  if ('allocated_user_ids' in body) {
    update.allocated_user_ids = Array.isArray(body.allocated_user_ids)
      ? body.allocated_user_ids.filter((v: unknown) => typeof v === 'string')
      : []
    // Keep the singular column (read by the cron job) as "primary" —
    // first entry in the array, or whatever was explicitly sent.
    if (!('allocated_user_id' in body)) {
      update.allocated_user_id = (update.allocated_user_ids as string[])[0] ?? null
    }
  }
  if (typeof body.priority === 'string') {
    if (!PRIORITIES.includes(body.priority)) return NextResponse.json({ error: 'invalid priority' }, { status: 400 })
    update.priority = body.priority
  }
  if ('source' in body) {
    if (body.source !== null && !SOURCES.includes(body.source)) {
      return NextResponse.json({ error: 'invalid source' }, { status: 400 })
    }
    update.source = body.source
  }
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status) || body.status === 'confirmed') {
      // 'confirmed' must go through /confirm — it needs to create a
      // client row too, which this route has no way to do atomically.
      return NextResponse.json({ error: 'invalid status — use /confirm to move a lead to Client Directory' }, { status: 400 })
    }
    update.status = body.status
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const admin = supabaseAdmin()
  const { data: before } = await admin
    .from('client_leads')
    .select('title, status, priority, next_follow_up_at, allocated_user_ids, phone, notes, source')
    .eq('id', id)
    .maybeSingle()

  const { error } = await admin
    .from('client_leads')
    .update(update)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const description = before ? describeLeadUpdate(before, update) : ''
  if (description) {
    logServerActivity({
      accountId: ctx.accountId,
      userId: ctx.userId,
      action: 'update',
      entityType: 'client_lead',
      entityId: id,
      description,
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('client_leads', 'delete', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin()
    .from('client_leads')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logServerActivity({
    accountId: ctx.accountId,
    userId: ctx.userId,
    action: 'delete',
    entityType: 'client_lead',
    entityId: id,
    description: 'Rejected/deleted an enquiry',
  })

  return NextResponse.json({ ok: true })
}
