import { NextResponse } from 'next/server'
import { requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// POST /api/client-leads/[id]/future — a 4th outcome alongside
// Confirm/Reject/Hold: "maybe later." Copies the lead's identifying
// info into `future_clients` (title, client_name, phone, notes,
// source_lead_id) then deletes the lead — same shape as /confirm,
// just landing in a different table.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('client_leads', 'update', 'employee')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { data: lead, error: leadError } = await ctx.supabase
    .from('client_leads')
    .select('*')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const { data: futureClient, error: createError } = await ctx.supabase
    .from('future_clients')
    .insert({
      account_id: ctx.accountId,
      title: lead.title,
      client_name: lead.title,
      phone: lead.phone,
      notes: lead.notes,
      source_lead_id: lead.id,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (createError || !futureClient) {
    console.error('[client-leads] future creation failed:', createError)
    return NextResponse.json({ error: 'Could not move this lead to Future Clients' }, { status: 500 })
  }

  const { error: deleteError } = await ctx.supabase
    .from('client_leads')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (deleteError) console.error('[client-leads] future cleanup (lead delete) failed:', deleteError)

  return NextResponse.json({ futureClient })
}
