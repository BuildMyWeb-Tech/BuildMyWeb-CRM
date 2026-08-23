import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { buildAuthUrl } from '@/lib/google-drive/client'

// GET /api/google-drive/connect — admin-only. Redirects to Google's
// OAuth consent screen. `state` carries the account_id so the
// callback knows which BMW CRM account to attach the connection to
// (Google's redirect can't otherwise carry our own session context).

export async function GET(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const redirectUri = new URL('/api/google-drive/callback', request.url).toString()
  const authUrl = buildAuthUrl(redirectUri, ctx.accountId)
  return NextResponse.redirect(authUrl)
}