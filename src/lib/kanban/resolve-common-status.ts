import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Maps a project_task's pipeline stage onto a `kanban_common_statuses`
 * row so it lands in the RIGHT column on the unified cross-project
 * Kanban board (src/app/(dashboard)/kanban/page.tsx), instead of
 * always falling into that board's first column.
 *
 * Every new project's default board is seeded with the same 4 stage
 * names the account's common statuses were seeded with (see
 * 056_common_kanban.sql: 'To Do' / 'In Progress' / 'Review' / 'Done'),
 * so matching by name (case-insensitive) gets the common case right
 * for free. A custom stage name with no matching common status falls
 * back to the first common status by position — the same "unmapped
 * task" fallback the unified board's own render logic already uses
 * for a null common_status_id, just resolved once at write time
 * instead of every render.
 */
export async function resolveCommonStatusId(
  db: SupabaseClient,
  accountId: string,
  stageId: string,
): Promise<string | null> {
  const { data: stage } = await db
    .from('pipeline_stages')
    .select('name')
    .eq('id', stageId)
    .maybeSingle()

  const { data: statuses } = await db
    .from('kanban_common_statuses')
    .select('id, name, position')
    .eq('account_id', accountId)
    .order('position', { ascending: true })

  if (!statuses || statuses.length === 0) return null

  if (stage?.name) {
    const match = statuses.find((s) => s.name.trim().toLowerCase() === stage.name.trim().toLowerCase())
    if (match) return match.id
  }

  return statuses[0].id
}
