import { NextResponse } from 'next/server'
import { getCurrentAccount, requirePagePermission, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// PATCH /api/marketing-items/[id] — update fields.
// DELETE /api/marketing-items/[id] — agent+ only.
//
// Both need the row's own `category` first to know which
// page-permission key applies — it can't come from the request body
// (a client could lie about it to dodge a stricter page's grant), so
// this always reads the existing row before checking permission.

const PAGE_KEY_BY_CATEGORY: Record<string, string> = {
  tele_calling: 'marketing_tele_calling',
  content_creation: 'marketing_content_creation',
  paid_marketing: 'marketing_paid_marketing',
}

const STATUSES = ['planned', 'in_progress', 'done']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const account = await getCurrentAccount()
    const { data: existing, error: fetchError } = await account.supabase
      .from('marketing_items')
      .select('category')
      .eq('id', id)
      .eq('account_id', account.accountId)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const pageKey = PAGE_KEY_BY_CATEGORY[existing.category] ?? 'marketing_tele_calling'
    const ctx = await requirePagePermission(pageKey, 'update', 'employee')

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') {
      const title = body.title.trim()
      if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
      update.title = title
    }
    if ('description' in body) update.description = typeof body.description === 'string' ? body.description.trim() || null : null
    if ('assigned_user_id' in body) update.assigned_user_id = body.assigned_user_id ?? null
    if ('item_date' in body) update.item_date = body.item_date ?? null
    if (typeof body.status === 'string') {
      if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      update.status = body.status
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

    const { error } = await supabaseAdmin()
      .from('marketing_items')
      .update(update)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const account = await getCurrentAccount()
    const { data: existing, error: fetchError } = await account.supabase
      .from('marketing_items')
      .select('category')
      .eq('id', id)
      .eq('account_id', account.accountId)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const pageKey = PAGE_KEY_BY_CATEGORY[existing.category] ?? 'marketing_tele_calling'
    const ctx = await requirePagePermission(pageKey, 'delete', 'agent')

    const { error } = await supabaseAdmin()
      .from('marketing_items')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
