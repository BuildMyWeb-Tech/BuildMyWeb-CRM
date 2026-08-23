import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// GET /api/google-drive/files?project_id=X or ?client_id=X (or
// neither, for the account-wide/unlinked list).

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const clientId = searchParams.get('client_id')

    let query = ctx.supabase
      .from('drive_files')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (projectId) query = query.eq('project_id', projectId)
    else if (clientId) query = query.eq('client_id', clientId)
    else query = query.is('project_id', null).is('client_id', null)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ files: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
