import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/client-payments/[id] — one payment + its allocations.
// PATCH /api/client-payments/[id] — update the payment's own fields
//   and replace its allocations wholesale (delete + re-insert is
//   simpler and safer than diffing a small array client-side, same
//   approach as the permissions grid).
// DELETE /api/client-payments/[id] — admin-only. Allocations cascade
//   automatically (payment_allocations.payment_id ON DELETE CASCADE).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase
      .from('client_payments')
      .select('*, client:clients(id, name), allocations:payment_allocations(*)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    return NextResponse.json({ payment: data })
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const admin = supabaseAdmin()

  const PAYMENT_STATUSES = ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded']
  const update: Record<string, unknown> = {}
  if (typeof body.client_id === 'string') update.client_id = body.client_id
  if ('project_id' in body) update.project_id = body.project_id ?? null
  if ('service_description' in body) update.service_description = body.service_description ?? null
  if ('received_date' in body) update.received_date = typeof body.received_date === 'string' ? body.received_date : null
  if ('expected_date' in body) update.expected_date = typeof body.expected_date === 'string' ? body.expected_date : null
  if (typeof body.amount === 'number') update.amount = body.amount
  if ('domain_fee' in body) update.domain_fee = typeof body.domain_fee === 'number' ? body.domain_fee : null
  if ('hosting_fee' in body) update.hosting_fee = typeof body.hosting_fee === 'number' ? body.hosting_fee : null
  if ('payment_method' in body) update.payment_method = body.payment_method ?? null
  if ('transaction_id' in body) update.transaction_id = body.transaction_id ?? null
  if (typeof body.status === 'string' && PAYMENT_STATUSES.includes(body.status)) update.status = body.status
  if ('notes' in body) update.notes = body.notes ?? null

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await admin
      .from('client_payments')
      .update(update)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (Array.isArray(body.allocations)) {
    const rawAllocations: AllocationInput[] = body.allocations
    const allocations = rawAllocations
      .map((a) => ({
        recipient_type: a.recipient_type === 'company' ? 'company' : 'team_member',
        recipient_user_id: typeof a.recipient_user_id === 'string' ? a.recipient_user_id : null,
        role_label: typeof a.role_label === 'string' ? a.role_label : null,
        amount: typeof a.amount === 'number' ? a.amount : NaN,
      }))
      .filter((a) => Number.isFinite(a.amount) && (a.recipient_type === 'company' || a.recipient_user_id))

    const { error: deleteError } = await admin.from('payment_allocations').delete().eq('payment_id', id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    if (allocations.length > 0) {
      const { error: insertError } = await admin.from('payment_allocations').insert(
        allocations.map((a) => ({
          account_id: ctx.accountId,
          payment_id: id,
          recipient_type: a.recipient_type,
          recipient_user_id: a.recipient_user_id,
          role_label: a.role_label,
          amount: a.amount,
        })),
      )
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin()
    .from('client_payments')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
