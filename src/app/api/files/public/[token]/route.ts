import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/files/public/[token]
//
// The only unauthenticated route in the File Manager. Looks up the
// file by its share_token, refuses unless is_public is currently
// true (flipping that back off revokes the link immediately even
// though the token string itself doesn't change), then generates a
// short-lived signed URL and redirects — the actual bytes are never
// served through this app, and the underlying bucket stays private
// the entire time. See 042_file_manager.sql for the full model.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const db = supabaseAdmin()

  const { data: file, error } = await db
    .from('files')
    .select('storage_path, name, is_public')
    .eq('share_token', token)
    .maybeSingle()

  if (error || !file || !file.is_public) {
    return NextResponse.json({ error: 'This link is invalid or no longer shared.' }, { status: 404 })
  }

  const { data: signed, error: signError } = await db.storage
    .from('files')
    .createSignedUrl(file.storage_path, 60, {
      download: file.name,
    })

  if (signError || !signed) {
    return NextResponse.json({ error: 'Could not generate a download link.' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}