import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

const VALID_METHODS = ['upi','bank_transfer','cash','cheque','card','other']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false })
    if (error) throw error
    return NextResponse.json({ payments: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const amount = parseFloat(body.amount)
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })

    // Get invoice
    const { data: inv } = await ctx.supabase
      .from('invoices')
      .select('id, total_amount, paid_amount, balance_due, status')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .single()
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const newPaid = (inv.paid_amount ?? 0) + amount
    const newBalance = Math.max(0, (inv.total_amount ?? 0) - newPaid)
    const newStatus = newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partially_paid' : inv.status

    const { data: payment, error: payErr } = await ctx.supabase
      .from('invoice_payments')
      .insert({
        invoice_id: id,
        amount,
        payment_date: body.payment_date || new Date().toISOString().slice(0, 10),
        payment_method: VALID_METHODS.includes(body.payment_method) ? body.payment_method : 'bank_transfer',
        reference: body.reference || null,
        notes: body.notes || null,
        created_by: ctx.userId,
      })
      .select()
      .single()
    if (payErr) throw payErr

    await ctx.supabase
      .from('invoices')
      .update({ paid_amount: newPaid, balance_due: newBalance, status: newStatus })
      .eq('id', id)

    return NextResponse.json({ payment }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
