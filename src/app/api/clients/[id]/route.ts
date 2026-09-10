import { NextResponse } from 'next/server'
import { getCurrentAccount, requirePagePermission, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/clients/[id] — client + its scope-of-work entries.
// PATCH /api/clients/[id] — update fields (employee+, matches the
//   Update-only role's whole reason for existing).
// DELETE /api/clients/[id] — agent+ only.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()

    const { data: client, error: clientError } = await ctx.supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (clientError) throw clientError
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const { data: scopeItems, error: scopeError } = await ctx.supabase
      .from('scope_of_work')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
    if (scopeError) throw scopeError

    return NextResponse.json({ client, scopeOfWork: scopeItems ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePagePermission('client_directory', 'update', 'employee')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    update.name = name
  }
  if ('interface_name' in body) update.interface_name = body.interface_name ?? null
  if ('interface_contact_number' in body) update.interface_contact_number = body.interface_contact_number ?? null
  if ('accent_color' in body) update.accent_color = body.accent_color ?? null
  if ('client_since' in body) update.client_since = body.client_since ?? null
  if ('notes' in body) update.notes = body.notes ?? null
  if ('logo_storage_path' in body) update.logo_storage_path = body.logo_storage_path ?? null
  if ('industry' in body) update.industry = body.industry ?? null
  if ('phone' in body) update.phone = body.phone ?? null
  if ('email' in body) update.email = body.email ?? null
  if ('owner_user_id' in body) update.owner_user_id = body.owner_user_id ?? null
  if ('next_follow_up_at' in body) update.next_follow_up_at = body.next_follow_up_at ?? null
  if (typeof body.status === 'string') {
    if (!['active', 'inactive', 'archived'].includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    update.status = body.status
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const admin = supabaseAdmin()
  const { error } = await admin
    .from('clients')
    .update(update)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Client and Project status now share one vocabulary
  // (065_unify_project_client_status.sql) specifically so this
  // cascade can be a direct copy — a client going inactive/archived
  // carries its project(s) along instead of leaving them showing
  // "active" while the client isn't. One-directional here (client ->
  // its projects): a client can have multiple projects, so there's
  // no ambiguity going this way, unlike the reverse (see the
  // matching cascade in PATCH /api/projects/[id], which only ever
  // has exactly one client to bounce back to).
  if (typeof update.status === 'string') {
    const { error: projectError } = await admin
      .from('projects')
      .update({ status: update.status })
      .eq('client_id', id)
      .eq('account_id', ctx.accountId)
    if (projectError) console.error('[clients] project status cascade failed:', projectError)
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
    ctx = await requirePagePermission('client_directory', 'delete', 'agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin()
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
