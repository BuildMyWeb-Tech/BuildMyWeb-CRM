import { NextResponse } from 'next/server'
import { getCurrentAccount, requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// GET /api/marketing-items?category=tele_calling|content_creation|paid_marketing
// POST /api/marketing-items — one table shared by all three Marketing
// sub-pages (see 062_product_marketing_modules.sql); `category` picks
// which page-permission key gates the write.

const CATEGORIES = ['tele_calling', 'content_creation', 'paid_marketing'] as const
type Category = (typeof CATEGORIES)[number]

const PAGE_KEY_BY_CATEGORY: Record<Category, string> = {
  tele_calling: 'marketing_tele_calling',
  content_creation: 'marketing_content_creation',
  paid_marketing: 'marketing_paid_marketing',
}

const STATUSES = ['planned', 'in_progress', 'done']

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const url = new URL(request.url)
    const category = url.searchParams.get('category')
    if (!category || !CATEGORIES.includes(category as Category)) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 })
    }

    const { data, error } = await ctx.supabase
      .from('marketing_items')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('category', category)
      .order('item_date', { ascending: true, nullsFirst: false })
    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const category = typeof body.category === 'string' ? body.category : ''
  if (!CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 })
  }

  let ctx
  try {
    ctx = await requirePagePermission(PAGE_KEY_BY_CATEGORY[category as Category], 'create', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const status = typeof body.status === 'string' && STATUSES.includes(body.status) ? body.status : 'planned'

  const { data: item, error } = await ctx.supabase
    .from('marketing_items')
    .insert({
      account_id: ctx.accountId,
      category,
      title,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      status,
      assigned_user_id: typeof body.assigned_user_id === 'string' ? body.assigned_user_id : null,
      item_date: typeof body.item_date === 'string' ? body.item_date : null,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[marketing-items] create failed:', error)
    return NextResponse.json({ error: 'Could not create item' }, { status: 500 })
  }

  return NextResponse.json({ item }, { status: 201 })
}
