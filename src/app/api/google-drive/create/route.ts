import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createDriveFile } from '@/lib/google-drive/client'

// POST /api/google-drive/create — creates a blank Doc or Sheet via
// the Drive API, records it in `drive_files`, optionally linked to
// one project OR one client (never both — see the CHECK constraint
// in 053_google_drive.sql).

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const type = body.type === 'sheet' ? 'sheet' : body.type === 'doc' ? 'doc' : null
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const projectId = typeof body.project_id === 'string' ? body.project_id : null
  const clientId = typeof body.client_id === 'string' ? body.client_id : null

  if (!type) return NextResponse.json({ error: 'type must be "doc" or "sheet"' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (projectId && clientId) {
    return NextResponse.json({ error: 'Link to a project OR a client, not both' }, { status: 400 })
  }

  let driveFile
  try {
    driveFile = await createDriveFile(ctx.supabase, ctx.accountId, type, name)
  } catch (err) {
    console.error('[google-drive/create] failed:', err)
    const message = err instanceof Error ? err.message : 'Could not create the file'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const { data: row, error: insertError } = await ctx.supabase
    .from('drive_files')
    .insert({
      account_id: ctx.accountId,
      project_id: projectId,
      client_id: clientId,
      drive_file_id: driveFile.id,
      name: driveFile.name,
      file_type: type,
      web_view_link: driveFile.webViewLink,
      icon_link: driveFile.iconLink,
      created_by: ctx.userId,
    })
    .select('*')
    .single()

  if (insertError) {
    console.error('[google-drive/create] db insert failed:', insertError)
    // The Drive file itself was created successfully — return it
    // even though we couldn't record it, rather than losing the
    // fact it exists (its webViewLink still works).
    return NextResponse.json({
      driveFile: { ...driveFile, file_type: type },
      warning: 'File created in Drive but could not be saved to BMW CRM — refresh may not show it.',
    })
  }

  return NextResponse.json({ file: row }, { status: 201 })
}
