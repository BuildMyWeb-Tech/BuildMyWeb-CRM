import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// PATCH /api/product-tasks/[id] — update a product task
// DELETE /api/product-tasks/[id] — delete a product task

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const allowed = ['title', 'description', 'priority', 'due_date', 'assignee_user_id', 'assignee_user_ids', 'stage_id', 'product_id', 'position']
    const patch: Record<string, unknown> = {}
    for (const k of allowed) if (k in body) patch[k] = body[k]

    const { data, error } = await ctx.supabase
      .from('product_tasks')
      .update(patch)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await getCurrentAccount()
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
