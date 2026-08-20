import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/kanban-boards/[id] — board + its stages + cards, one call.
// DELETE /api/kanban-boards/[id] — deletes the board wrapper + cards
//   (ON DELETE CASCADE); the pipeline itself is left behind, same
//   reasoning as Projects (ON DELETE RESTRICT on kanban_boards.pipeline_id).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const ctx = await getCurrentAccount()

    const { data: board, error: boardError } = await ctx.supabase
      .from('kanban_boards')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (boardError) throw boardError
    if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

    const { data: stages, error: stagesError } = await ctx.supabase
      .from('pipeline_stages')
      .select('*')
      .eq('pipeline_id', board.pipeline_id)
      .order('position', { ascending: true })
    if (stagesError) throw stagesError

    const { data: cards, error: cardsError } = await ctx.supabase
      .from('kanban_cards')
      .select('*')
      .eq('board_id', id)
      .order('position', { ascending: true })
    if (cardsError) throw cardsError

    return NextResponse.json({ board, stages: stages ?? [], cards: cards ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin()
    .from('kanban_boards')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
