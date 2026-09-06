import { NextResponse } from 'next/server'
import { getCurrentAccount, requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// GET /api/products — list products for this account.
// POST /api/products — create a product. Only `project_name` is required.

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('products')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('project_name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ products: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requirePagePermission('products', 'create', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const projectName = typeof body.project_name === 'string' ? body.project_name.trim() : ''
  if (!projectName) return NextResponse.json({ error: 'project_name is required' }, { status: 400 })

  const { data: product, error } = await ctx.supabase
    .from('products')
    .insert({
      account_id: ctx.accountId,
      project_name: projectName,
      purpose: typeof body.purpose === 'string' ? body.purpose.trim() || null : null,
      project_url_1: typeof body.project_url_1 === 'string' ? body.project_url_1.trim() || null : null,
      project_url_2: typeof body.project_url_2 === 'string' ? body.project_url_2.trim() || null : null,
      tech_stack: typeof body.tech_stack === 'string' ? body.tech_stack.trim() || null : null,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[products] create failed:', error)
    return NextResponse.json({ error: 'Could not create product' }, { status: 500 })
  }

  return NextResponse.json({ product }, { status: 201 })
}
