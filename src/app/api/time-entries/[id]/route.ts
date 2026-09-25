import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('client_name' in body) update.client_name = body.client_name || null
    if ('project_id' in body) update.project_id = body.project_id || null
    if ('task_name' in body) update.task_name = body.task_name || null
    if ('hours' in body) update.hours = parseFloat(body.hours) || 0
    if ('entry_date' in body) update.entry_date = body.entry_date
    if ('notes' in body) update.notes = body.notes || null

    const { data, error } = await ctx.supabase
      .from('time_entries').update(update).eq('id', id).eq('account_id', ctx.accountId).select().single()
    if (error) throw error
    return NextResponse.json({ entry: data })
  } catch (err) { return toErrorResponse(err) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const { error } = await ctx.supabase.from('time_entries').delete().eq('id', id).eq('account_id', ctx.accountId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) { return toErrorResponse(err) }
}
