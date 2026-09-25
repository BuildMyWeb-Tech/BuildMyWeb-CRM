import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // YYYY-MM

    let query = ctx.supabase
      .from('time_entries')
      .select('*, project:projects(id,name)')
      .eq('account_id', ctx.accountId)
      .order('entry_date', { ascending: false })

    if (month) {
      query = query.gte('entry_date', `${month}-01`).lte('entry_date', `${month}-31`)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ entries: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const hours = parseFloat(body.hours)
    if (!hours || hours <= 0) return NextResponse.json({ error: 'Hours must be > 0' }, { status: 400 })

    const { data, error } = await ctx.supabase
      .from('time_entries')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        client_name: body.client_name || null,
        project_id: body.project_id || null,
        task_name: body.task_name || null,
        hours,
        entry_date: body.entry_date || new Date().toISOString().slice(0, 10),
        notes: body.notes || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ entry: data }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
