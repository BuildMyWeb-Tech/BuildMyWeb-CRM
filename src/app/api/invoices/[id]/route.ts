import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

const VALID_STATUSES = ['draft','sent','viewed','paid','partially_paid','overdue','cancelled','void']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('invoices')
      .select('*, invoice_items(*), invoice_payments(*)')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ invoice: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { items, ...invoiceBody } = body
    const update: Record<string, unknown> = {}

    if ('client_name' in invoiceBody) update.client_name = invoiceBody.client_name
    if ('client_id' in invoiceBody) update.client_id = invoiceBody.client_id || null
    if ('project_id' in invoiceBody) update.project_id = invoiceBody.project_id || null
    if ('invoice_number' in invoiceBody) update.invoice_number = invoiceBody.invoice_number
    if ('issue_date' in invoiceBody) update.issue_date = invoiceBody.issue_date || null
    if ('due_date' in invoiceBody) update.due_date = invoiceBody.due_date || null
    if ('currency' in invoiceBody) update.currency = invoiceBody.currency
    if ('po_number' in invoiceBody) update.po_number = invoiceBody.po_number || null
    if ('customer_note' in invoiceBody) update.customer_note = invoiceBody.customer_note || null
    if ('internal_note' in invoiceBody) update.internal_note = invoiceBody.internal_note || null
    if (typeof invoiceBody.status === 'string' && VALID_STATUSES.includes(invoiceBody.status)) {
      update.status = invoiceBody.status
      if (invoiceBody.status === 'sent') update.sent_at = new Date().toISOString()
    }

    // Recalculate if items provided
    if (Array.isArray(items)) {
      let subtotal = 0, discountAmount = 0, taxAmount = 0
      for (const item of items) {
        const lineBase = (Number(item.quantity) || 1) * (Number(item.unit_price) || 0)
        const lineDist = lineBase * ((Number(item.discount_pct) || 0) / 100)
        const lineAfterDisc = lineBase - lineDist
        const lineTax = lineAfterDisc * ((Number(item.tax_pct) || 0) / 100)
        subtotal += lineBase; discountAmount += lineDist; taxAmount += lineTax
      }
      const invDiscount = parseFloat(String(invoiceBody.discount_amount ?? '0')) || 0
      const totalAmount = subtotal - discountAmount + taxAmount - invDiscount
      // Get current paid
      const { data: cur } = await ctx.supabase.from('invoices').select('paid_amount').eq('id', id).single()
      const paid = cur?.paid_amount ?? 0
      update.subtotal = subtotal
      update.discount_amount = discountAmount + invDiscount
      update.tax_amount = taxAmount
      update.total_amount = totalAmount
      update.amount = totalAmount
      update.balance_due = Math.max(0, totalAmount - paid)
      update.status = paid >= totalAmount ? 'paid' : paid > 0 ? 'partially_paid' : update.status ?? 'draft'

      // Replace items
      await ctx.supabase.from('invoice_items').delete().eq('invoice_id', id)
      if (items.length > 0) {
        const itemRows = items.map((item: Record<string, unknown>, i: number) => {
          const lineBase = (Number(item.quantity) || 1) * (Number(item.unit_price) || 0)
          const lineDist = lineBase * ((Number(item.discount_pct) || 0) / 100)
          const lineAfterDisc = lineBase - lineDist
          const lineTax = lineAfterDisc * ((Number(item.tax_pct) || 0) / 100)
          return {
            invoice_id: id,
            product_id: item.product_id || null,
            description: item.description || '',
            quantity: Number(item.quantity) || 1,
            unit: item.unit || 'pcs',
            unit_price: Number(item.unit_price) || 0,
            discount_pct: Number(item.discount_pct) || 0,
            tax_pct: Number(item.tax_pct) || 0,
            line_total: lineAfterDisc + lineTax,
            position: i,
          }
        })
        await ctx.supabase.from('invoice_items').insert(itemRows)
      }
    }

    update.updated_at = new Date().toISOString()
    const { data, error } = await ctx.supabase
      .from('invoices').update(update).eq('id', id).eq('account_id', ctx.accountId).select().single()
    if (error) throw error
    return NextResponse.json({ invoice: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()
    // Only allow deleting drafts
    const { data: inv } = await ctx.supabase.from('invoices').select('status').eq('id', id).eq('account_id', ctx.accountId).single()
    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (inv.status !== 'draft') return NextResponse.json({ error: 'Only draft invoices can be deleted' }, { status: 400 })
    const { error } = await ctx.supabase.from('invoices').delete().eq('id', id).eq('account_id', ctx.accountId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
