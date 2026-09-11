import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/internal/cleanup/done-tasks
 *
 * Deletes project_tasks rows that have been in a "done" stage for more
 * than 24 hours. Secured by the same INTERNAL_API_SECRET header used by
 * the WhatsApp worker — call this from a cron job or Vercel cron route.
 */
export async function POST(request: Request) {
  const secret = request.headers.get('x-internal-secret')
  const expected = process.env.INTERNAL_API_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_done_project_tasks', { hours_old: 24 })

  if (error) {
    console.error('[cleanup/done-tasks] RPC failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: data ?? 0 })
}
