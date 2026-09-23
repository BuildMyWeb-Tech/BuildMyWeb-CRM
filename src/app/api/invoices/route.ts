import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

const VALID_STATUSES = ['draft','sent','viewed','paid','partially_paid','overdue','cancelled','void']

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('q')

    let query = ctx.supabase
      .from('invoices')
      .select('*, invoice_items(*), invoice_payments(*)')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.or(`invoice_number.ilike.%${search}%,client_name.ilike.%${search}%`)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ invoices: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const { items = [], ...invoiceBody } = body

    // Auto-generate invoice number if not provided
    let invoiceNumber = invoiceBody.invoice_number?.trim()
    if (!invoiceNumber) {
      const { data: last } = await ctx.supabase
        .from('invoices')
        .select('invoice_number')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastNum = last?.invoice_number?.match(/(\d+)$/)
      const nextNum = lastNum ? (parseInt(lastNum[1]) + 1) : 1
      invoiceNumber = `INV-${String(nextNum).padStart(5, '0')}`
    }

    // Calculate totals from items
    let subtotal = 0
    let discountAmount = 0
    let taxAmount = 0
    for (const item of items) {
      const lineBase = (item.quantity ?? 1) * (item.unit_price ?? 0)
      const lineDist = lineBase * ((item.discount_pct ?? 0) / 100)
      const lineAfterDisc = lineBase - lineDist
      const lineTax = lineAfterDisc * ((item.tax_pct ?? 0) / 100)
      subtotal += lineBase
      discountAmount += lineDist
      taxAmount += lineTax
    }
    const invDiscount = parseFloat(invoiceBody.discount_amount ?? '0') || 0
    const totalAmount = subtotal - discountAmount + taxAmount - invDiscount
    const balanceDue = totalAmount

    const { data: invoice, error: invErr } = await ctx.supabase
      .from('invoices')
      .insert({
        account_id: ctx.accountId,
        invoice_number: invoiceNumber,
        client_id: invoiceBody.client_id || null,
        client_name: invoiceBody.client_name?.trim() || '',
        project_id: invoiceBody.project_id || null,
        currency: invoiceBody.currency || 'INR',
        status: VALID_STATUSES.includes(invoiceBody.status) ? invoiceBody.status : 'draft',
        issue_date: invoiceBody.issue_date || null,
        due_date: invoiceBody.due_date || null,
        subtotal,
        discount_amount: discountAmount + invDiscount,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        balance_due: balanceDue,
        paid_amount: 0,
        amount: totalAmount,
        po_number: invoiceBody.po_number || null,
        customer_note: invoiceBody.customer_note || null,
        internal_note: invoiceBody.internal_note || null,
        created_by: ctx.userId,
      })
      .select()
      .single()

    if (invErr) throw invErr

    // Insert line items
    if (items.length > 0) {
      const itemRows = items.map((item: Record<string, unknown>, i: number) => {
        const lineBase = (Number(item.quantity) || 1) * (Number(item.unit_price) || 0)
        const lineDist = lineBase * ((Number(item.discount_pct) || 0) / 100)
        const lineAfterDisc = lineBase - lineDist
        const lineTax = lineAfterDisc * ((Number(item.tax_pct) || 0) / 100)
        return {
          invoice_id: invoice.id,
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

    return NextResponse.json({ invoice }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
