import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'

// GET /api/client-payments — list payments (+ allocations, + client
//   name) for this account, optionally filtered by ?client_id=,
//   ?from=YYYY-MM-DD, ?to=YYYY-MM-DD.
// POST /api/client-payments — create a payment AND its allocations
//   array in one call. Admin-only (see 052_client_payments.sql).

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('client_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    let query = ctx.supabase
      .from('client_payments')
      .select('*, client:clients(id, name), allocations:payment_allocations(*)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (clientId) query = query.eq('client_id', clientId)
    if (from) query = query.gte('received_date', from)
    if (to) query = query.lte('received_date', to)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ payments: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

interface AllocationInput {
  recipient_type?: unknown
  recipient_user_id?: unknown
  role_label?: unknown
  amount?: unknown
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const PAYMENT_STATUSES = ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded']
  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  const receivedDate = typeof body.received_date === 'string' ? body.received_date : null
  const amount = typeof body.amount === 'number' ? body.amount : NaN
  if (!clientId) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  if (!Number.isFinite(amount)) return NextResponse.json({ error: 'amount is required' }, { status: 400 })

  const rawAllocations: AllocationInput[] = Array.isArray(body.allocations) ? body.allocations : []
  const allocations = rawAllocations
    .map((a) => ({
      recipient_type: a.recipient_type === 'company' ? 'company' : 'team_member',
      recipient_user_id: typeof a.recipient_user_id === 'string' ? a.recipient_user_id : null,
      role_label: typeof a.role_label === 'string' ? a.role_label : null,
      amount: typeof a.amount === 'number' ? a.amount : NaN,
    }))
    .filter((a) => Number.isFinite(a.amount) && (a.recipient_type === 'company' || a.recipient_user_id))

  const { data: payment, error: paymentError } = await ctx.supabase
    .from('client_payments')
    .insert({
      account_id: ctx.accountId,
      client_id: clientId,
      project_id: typeof body.project_id === 'string' ? body.project_id : null,
      service_description: typeof body.service_description === 'string' ? body.service_description : null,
      received_date: receivedDate,
      expected_date: typeof body.expected_date === 'string' ? body.expected_date : null,
      amount,
      domain_fee: typeof body.domain_fee === 'number' ? body.domain_fee : null,
      hosting_fee: typeof body.hosting_fee === 'number' ? body.hosting_fee : null,
      payment_method: typeof body.payment_method === 'string' ? body.payment_method : null,
      transaction_id: typeof body.transaction_id === 'string' ? body.transaction_id : null,
      status: typeof body.status === 'string' && PAYMENT_STATUSES.includes(body.status) ? body.status : 'paid',
      notes: typeof body.notes === 'string' ? body.notes : null,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (paymentError || !payment) {
    console.error('[client-payments] create failed:', paymentError)
    return NextResponse.json({ error: 'Could not create payment' }, { status: 500 })
  }

  if (allocations.length > 0) {
    const { error: allocError } = await ctx.supabase.from('payment_allocations').insert(
      allocations.map((a) => ({
        account_id: ctx.accountId,
        payment_id: payment.id,
        recipient_type: a.recipient_type,
        recipient_user_id: a.recipient_user_id,
        role_label: a.role_label,
        amount: a.amount,
      })),
    )
    if (allocError) {
      // Payment itself is saved either way — allocations failing is
      // recoverable (edit later), losing the payment record isn't.
      console.error('[client-payments] allocation insert failed:', allocError)
    }
  }

  return NextResponse.json({ id: payment.id }, { status: 201 })
}
