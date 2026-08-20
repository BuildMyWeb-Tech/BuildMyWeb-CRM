import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

// GET /api/clients — list clients for this account.
// POST /api/clients — create a client. Only `name` is required —
// every other field is optional per BMW's call (multi-sector shop,
// not every client needs every field filled in at creation).

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('clients')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ clients: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: client, error } = await ctx.supabase
    .from('clients')
    .insert({
      account_id: ctx.accountId,
      name,
      interface_name: typeof body.interface_name === 'string' ? body.interface_name : null,
      interface_contact_number:
        typeof body.interface_contact_number === 'string' ? body.interface_contact_number : null,
      accent_color: typeof body.accent_color === 'string' ? body.accent_color : null,
      client_since: typeof body.client_since === 'string' ? body.client_since : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[clients] create failed:', error)
    return NextResponse.json({ error: 'Could not create client' }, { status: 500 })
  }

  return NextResponse.json({ client }, { status: 201 })
}
