import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

const DAILY_TASK_STAGES = [
  { name: 'To Do',        color: '#94a3b8', position: 0 },
  { name: 'In Progress',  color: '#facc15', position: 1 },
  { name: 'Review',       color: '#60a5fa', position: 2 },
  { name: 'Done',         color: '#22c55e', position: 3 },
]

// POST /api/daily-tasks/setup
// Idempotent — creates the "Daily Tasks" pipeline + stages if they
// don't exist yet for this account (e.g. accounts created after the
// migration seed ran). Safe to call on every page load.
export async function POST() {
  try {
    const ctx = await getCurrentAccount()

    // Check if pipeline already exists
    const { data: existing } = await ctx.supabase
      .from('pipelines')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('name', 'Daily Tasks')
      .maybeSingle()

    if (existing) {
      // Also ensure stages exist (they may have been missed if the account was created
      // before migration 050 seeded them, or if a client-side insert failed)
      const { count } = await ctx.supabase
        .from('pipeline_stages')
        .select('id', { count: 'exact', head: true })
        .eq('pipeline_id', existing.id)
      if ((count ?? 0) === 0) {
        const stages = DAILY_TASK_STAGES.map((s) => ({ ...s, pipeline_id: existing.id }))
        await ctx.supabase.from('pipeline_stages').insert(stages)
      }
      return NextResponse.json({ created: false, pipelineId: existing.id })
    }

    // Get account owner user_id for the pipeline row
    const { data: account } = await ctx.supabase
      .from('accounts')
      .select('owner_user_id')
      .eq('id', ctx.accountId)
      .single()

    const { data: pipeline, error: pErr } = await ctx.supabase
      .from('pipelines')
      .insert({ account_id: ctx.accountId, user_id: account?.owner_user_id ?? ctx.userId, name: 'Daily Tasks' })
      .select()
      .single()

    if (pErr || !pipeline) throw pErr ?? new Error('pipeline insert failed')

    const stages = DAILY_TASK_STAGES.map((s) => ({ ...s, pipeline_id: pipeline.id }))
    const { error: sErr } = await ctx.supabase.from('pipeline_stages').insert(stages)
    if (sErr) throw sErr

    return NextResponse.json({ created: true, pipelineId: pipeline.id })
  } catch (err) {
    return toErrorResponse(err)
  }
}
