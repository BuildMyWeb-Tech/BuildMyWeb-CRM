import { NextResponse } from 'next/server'
import { exchangeCodeForTokens, fetchConnectedEmail } from '@/lib/google-drive/client'
import { encrypt } from '@/lib/whatsapp/encryption'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/google-drive/callback — Google redirects here after the
// user approves (or denies) the consent screen. No session check
// here beyond trusting `state` (the account_id set in /connect) —
// this route can't use requireRole() because Google's redirect is a
// fresh top-level navigation, and there's no meaningful "logged in
// as which BMW CRM user" concept to re-derive independently of what
// /connect already encoded into state. This mirrors the same
// state-carries-context pattern most OAuth "connect a third-party
// account" flows use.

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const accountId = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const redirectTo = (status: 'connected' | 'error') =>
    NextResponse.redirect(new URL(`/settings?tab=google-drive&drive=${status}`, request.url))

  if (error || !code || !accountId) {
    console.error('[google-drive] callback error or missing params:', error)
    return redirectTo('error')
  }

  try {
    const redirectUri = new URL('/api/google-drive/callback', request.url).toString()
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    if (!tokens.refresh_token) {
      // Happens if the user has connected before and Google skips
      // issuing a new refresh_token — `prompt=consent` in /connect
      // is specifically there to prevent this, but guard anyway
      // rather than silently store nothing.
      console.error('[google-drive] no refresh_token returned — re-consent required')
      return redirectTo('error')
    }

    const email = await fetchConnectedEmail(tokens.access_token)
    const db = supabaseAdmin()

    const { error: dbError } = await db.from('google_drive_config').upsert(
      {
        account_id: accountId,
        connected_email: email,
        refresh_token: encrypt(tokens.refresh_token),
        access_token: encrypt(tokens.access_token),
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      },
      { onConflict: 'account_id' },
    )
    if (dbError) {
      console.error('[google-drive] failed to store config:', dbError)
      return redirectTo('error')
    }

    return redirectTo('connected')
  } catch (err) {
    console.error('[google-drive] callback failed:', err)
    return redirectTo('error')
  }
}
