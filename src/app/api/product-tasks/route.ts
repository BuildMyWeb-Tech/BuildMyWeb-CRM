import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// GET /api/product-tasks — list all product tasks for the account
// POST /api/product-tasks — create a product task

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')

    let query = ctx.supabase
      .from('product_tasks')
      .select('id, title, description, priority, due_date, show_date, assignee_user_id, assignee_user_ids, position, created_at, product_id, stage_id, product:products(id, project_name), stage:pipeline_stages(id, name)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (productId) query = query.eq('product_id', productId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tasks: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const { data, error } = await ctx.supabase
      .from('product_tasks')
      .insert({
        account_id: ctx.accountId,
        title,
        description: body.description ?? null,
        priority: body.priority ?? 'medium',
        due_date: body.due_date ?? null,
        assignee_user_id: body.assignee_user_id ?? null,
        assignee_user_ids: body.assignee_user_ids ?? [],
        product_id: body.product_id ?? null,
        stage_id: body.stage_id ?? null,
        created_by: ctx.userId,
      })
      .select('id, title, priority, due_date, product_id, stage_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ task: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
