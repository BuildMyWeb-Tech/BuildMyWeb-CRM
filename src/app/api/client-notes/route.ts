import { NextResponse } from 'next/server'
import { getCurrentAccount, requirePagePermission, toErrorResponse } from '@/lib/auth/account'

// GET /api/client-notes?client_id= — notes for a client.
// POST /api/client-notes — create a note.

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const clientId = new URL(request.url).searchParams.get('client_id')
    if (!clientId) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })

    const { data, error } = await ctx.supabase
      .from('client_notes')
      .select('*, author:profiles(full_name)')
      .eq('client_id', clientId)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ notes: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requirePagePermission('client_directory', 'create', 'employee')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const clientId = typeof body.client_id === 'string' ? body.client_id : ''
  const noteText = typeof body.note_text === 'string' ? body.note_text.trim() : ''
  if (!clientId) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  if (!noteText) return NextResponse.json({ error: 'note_text is required' }, { status: 400 })

  const { data, error } = await ctx.supabase
    .from('client_notes')
    .insert({
      account_id: ctx.accountId,
      client_id: clientId,
      user_id: ctx.userId,
      note_text: noteText,
    })
    .select('*, author:profiles(full_name)')
    .single()

  if (error) {
    console.error('[client-notes] create failed:', error)
    return NextResponse.json({ error: 'Could not create note' }, { status: 500 })
  }

  return NextResponse.json({ note: data }, { status: 201 })
}
