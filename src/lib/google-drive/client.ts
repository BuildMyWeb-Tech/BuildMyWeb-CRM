import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

// ============================================================
// Google Drive integration — raw REST calls to Google's OAuth2 and
// Drive v3 endpoints via fetch(), not the `googleapis` npm package.
// That package isn't already a dependency here, and the surface
// area this app actually needs (token refresh, files.create,
// permissions.create) is a handful of plain REST calls — adding a
// large SDK for that felt like the wrong trade, but flag it: if
// more Drive API surface is needed later, revisit that call.
//
// Scope used: drive.file — the app can only see/manage files IT
// creates, never anything already in the connected account's Drive.
// That's why there's no "browse my existing Drive" feature here;
// the scope makes that structurally impossible, not just unbuilt.
// ============================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET!
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token every time, not just first-ever connect
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function fetchConnectedEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.email ?? null
}

/**
 * Returns a valid (non-expired) access token for this account's
 * connected Drive, refreshing and persisting it first if needed.
 * Throws if Drive isn't connected for this account.
 */
export async function getValidAccessToken(db: SupabaseClient, accountId: string): Promise<string> {
  const { data: config, error } = await db
    .from('google_drive_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error || !config) throw new Error('Google Drive is not connected for this account.')

  const expiresAt = config.access_token_expires_at ? new Date(config.access_token_expires_at) : null
  const stillValid = config.access_token && expiresAt && expiresAt.getTime() - Date.now() > 60_000 // 60s buffer

  if (stillValid) return decrypt(config.access_token)

  const refreshToken = decrypt(config.refresh_token)
  const tokens = await refreshAccessToken(refreshToken)

  const expiresAtNew = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await db
    .from('google_drive_config')
    .update({
      access_token: encrypt(tokens.access_token),
      access_token_expires_at: expiresAtNew,
    })
    .eq('account_id', accountId)

  return tokens.access_token
}

interface CreatedDriveFile {
  id: string
  name: string
  webViewLink: string
  iconLink: string | null
}

const MIME_TYPES = {
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
} as const

/**
 * Creates a blank Google Doc or Sheet under the connected account,
 * then sets it to "anyone with the link can edit" so any BMW CRM
 * teammate can open the embedded editor without needing their own
 * Google account explicitly added as a collaborator first.
 *
 * Trade-off, stated plainly: this means anyone who gets hold of the
 * link — not just people with a BMW CRM login — can edit the file,
 * since Google's own permission check happens at the browser/Google
 * layer, independent of BMW CRM's own auth. If that's too loose,
 * the alternative is inviting each teammate's own Google email as a
 * named collaborator instead (more setup, requires collecting
 * everyone's Google email up front) — flagging this as a real
 * decision point, not hiding it.
 */
export async function createDriveFile(
  db: SupabaseClient,
  accountId: string,
  type: 'doc' | 'sheet',
  name: string,
): Promise<CreatedDriveFile> {
  const accessToken = await getValidAccessToken(db, accountId)

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink,iconLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, mimeType: MIME_TYPES[type] }),
    },
  )
  if (!createRes.ok) {
    throw new Error(`Drive file creation failed: ${createRes.status} ${await createRes.text()}`)
  }
  const file: CreatedDriveFile = await createRes.json()

  const permRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'writer', type: 'anyone' }),
    },
  )
  if (!permRes.ok) {
    // File exists but isn't shareable yet — log and continue rather
    // than fail the whole creation; the connected account can still
    // open it, and sharing can be fixed manually in Drive itself.
    console.error(`[google-drive] permission set failed for ${file.id}:`, await permRes.text())
  }

  return file
}
