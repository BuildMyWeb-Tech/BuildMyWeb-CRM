import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentAccount()
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const allowed = ['title', 'description', 'priority', 'due_date', 'show_date', 'product_id', 'stage_id', 'assignee_user_id', 'assignee_user_ids', 'position']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const { data, error } = await ctx.supabase
      .from('product_tasks')
      .update(update)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id, title, priority, due_date, product_id, stage_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ task: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentAccount()
    const { id } = await params

    const { error } = await ctx.supabase
      .from('product_tasks')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
