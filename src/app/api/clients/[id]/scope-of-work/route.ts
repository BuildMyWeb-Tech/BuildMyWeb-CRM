import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

// POST /api/clients/[id]/scope-of-work — add a scope-of-work entry
// to a client. Service category / deliverable type are custom
// fields (entity_type='scope_of_work'), not columns here — see
// 047_custom_fields.sql.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { data, error } = await ctx.supabase
    .from('scope_of_work')
    .insert({
      account_id: ctx.accountId,
      client_id: clientId,
      description: typeof body.description === 'string' ? body.description : null,
      total_monthly_unit:
        typeof body.total_monthly_unit === 'number' ? body.total_monthly_unit : null,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[scope-of-work] create failed:', error)
    return NextResponse.json({ error: 'Could not create scope of work entry' }, { status: 500 })
  }

  return NextResponse.json({ scopeOfWork: data }, { status: 201 })
}
