import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('client_name' in body) update.client_name = body.client_name?.trim()
    if ('project_name' in body) update.project_name = body.project_name || null
    if ('rating' in body) update.rating = parseFloat(body.rating)
    if ('review_text' in body) update.review_text = body.review_text || null
    if ('review_date' in body) update.review_date = body.review_date
    if ('is_public' in body) update.is_public = !!body.is_public

    const { data, error } = await ctx.supabase
      .from('client_reviews').update(update).eq('id', id).eq('account_id', ctx.accountId).select().single()
    if (error) throw error
    return NextResponse.json({ review: data })
  } catch (err) { return toErrorResponse(err) }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const { error } = await ctx.supabase.from('client_reviews').delete().eq('id', id).eq('account_id', ctx.accountId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) { return toErrorResponse(err) }
}
