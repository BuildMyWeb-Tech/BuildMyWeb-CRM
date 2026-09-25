import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

const VALID_CATEGORIES = ['software','equipment','marketing','travel','meals','utilities','freelancer','rent','other']

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('name' in body) update.name = body.name?.trim() || null
    if ('category' in body) update.category = VALID_CATEGORIES.includes(body.category) ? body.category : 'other'
    if ('amount' in body) update.amount = parseFloat(body.amount) || 0
    if ('expense_date' in body) update.expense_date = body.expense_date
    if ('notes' in body) update.notes = body.notes || null

    const { data, error } = await ctx.supabase
      .from('expenses').update(update).eq('id', id).eq('account_id', ctx.accountId).select().single()
    if (error) throw error
    return NextResponse.json({ expense: data })
  } catch (err) { return toErrorResponse(err) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const { error } = await ctx.supabase.from('expenses').delete().eq('id', id).eq('account_id', ctx.accountId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) { return toErrorResponse(err) }
}
