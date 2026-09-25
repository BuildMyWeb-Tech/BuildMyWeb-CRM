import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

const VALID_CATEGORIES = ['software','equipment','marketing','travel','meals','utilities','freelancer','rent','other']

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const category = searchParams.get('category')

    let query = ctx.supabase
      .from('expenses')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('expense_date', { ascending: false })

    if (month) query = query.gte('expense_date', `${month}-01`).lte('expense_date', `${month}-31`)
    if (category && category !== 'all') query = query.eq('category', category)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ expenses: data ?? [] })
  } catch (err) { return toErrorResponse(err) }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const { data, error } = await ctx.supabase
      .from('expenses')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name: body.name.trim(),
        category: VALID_CATEGORIES.includes(body.category) ? body.category : 'other',
        amount: parseFloat(body.amount) || 0,
        expense_date: body.expense_date || new Date().toISOString().slice(0, 10),
        notes: body.notes || null,
      })
      .select().single()

    if (error) throw error
    return NextResponse.json({ expense: data }, { status: 201 })
  } catch (err) { return toErrorResponse(err) }
}
