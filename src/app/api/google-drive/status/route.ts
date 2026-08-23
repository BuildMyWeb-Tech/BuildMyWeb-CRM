import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// GET /api/google-drive/status — connection status for this
// account. Deliberately never returns the tokens themselves.

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const { data, error } = await ctx.supabase
      .from('google_drive_config')
      .select('id, connected_email, connected_by, created_at, updated_at')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ connected: !!data, config: data ?? null })
  } catch (err) {
    return toErrorResponse(err)
  }
}
