import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('client_reviews')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('review_date', { ascending: false })
    if (error) throw error
    return NextResponse.json({ reviews: data ?? [] })
  } catch (err) { return toErrorResponse(err) }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    if (!body.client_name?.trim()) return NextResponse.json({ error: 'Client name required' }, { status: 400 })

    const rating = parseFloat(body.rating)
    if (!rating || rating < 1 || rating > 5) return NextResponse.json({ error: 'Rating must be 1–5' }, { status: 400 })

    const { data, error } = await ctx.supabase
      .from('client_reviews')
      .insert({
        account_id: ctx.accountId,
        client_name: body.client_name.trim(),
        project_name: body.project_name || null,
        rating,
        review_text: body.review_text || null,
        review_date: body.review_date || new Date().toISOString().slice(0, 10),
        is_public: body.is_public ?? false,
      })
      .select().single()

    if (error) throw error
    return NextResponse.json({ review: data }, { status: 201 })
  } catch (err) { return toErrorResponse(err) }
}
