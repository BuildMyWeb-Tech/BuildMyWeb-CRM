import { NextResponse } from 'next/server'
import { getCurrentAccount, requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// GET /api/future-clients — list "maybe later" prospects for this account.
// POST /api/future-clients — add one directly (not only via the
//   Client Enquiry "Future client" action). Only `title` is required.

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('future_clients')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ futureClients: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requirePagePermission('future_clients', 'create', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const { data: futureClient, error } = await ctx.supabase
    .from('future_clients')
    .insert({
      account_id: ctx.accountId,
      title,
      client_name: typeof body.client_name === 'string' ? body.client_name.trim() || null : null,
      phone: typeof body.phone === 'string' ? body.phone.trim() || null : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[future-clients] create failed:', error)
    return NextResponse.json({ error: 'Could not create' }, { status: 500 })
  }

  return NextResponse.json({ futureClient }, { status: 201 })
}
