import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// GET /api/users — list local (username/password) accounts for this
//   account, with their status and role.
// POST /api/users — create one. Admin-only, matching Team Members'
//   existing gate.
//
// Supabase Auth requires a real email under the hood — there's no
// "username-only" mode at the platform level — so a synthetic email
// (username@buildmyweb.info) is generated and used only for the
// Supabase Auth record. The user only ever sees/enters their
// username; see the login page for the corresponding lookup.
//
// REAL RISK worth knowing: buildmyweb.info is BMW's actual domain.
// If anyone is ever invited through the existing Team Members flow
// using a genuine @buildmyweb.info address, and someone later picks
// a matching username here, the synthetic email collides with that
// real one — Supabase's email-uniqueness constraint would reject
// the create (safe failure, not a silent identity mix-up), but it's
// worth being aware this domain choice makes that collision
// possible at all. A clearly-fake domain (bmwcrm.internal, or a
// subdomain like users.buildmyweb.info) wouldn't have this property
// — kept as buildmyweb.info per explicit request, flagging it here
// rather than silently avoiding what was asked for.
//
// Usernames are unique across this whole deployment (not per
// account) — fine for BMW's single-workspace use.
//
// IMPORTANT — why this doesn't just INSERT a profiles row:
// supabase.auth.admin.createUser() fires this app's own
// on_auth_user_created trigger (017_account_sharing.sql), which
// AUTOMATICALLY creates a brand-new `accounts` row plus a `profiles`
// row for every new auth.users insert — the original WACRM
// self-signup behavior, still wired in under the hood even though
// the public /signup page is now invite-gated. That trigger's own
// profiles insert wins the UNIQUE(user_id) race before this route's
// code runs, so a second INSERT here would always fail — which is
// exactly the bug: the auth user (and a stray new `accounts` row)
// got created, then this route's own insert failed and reported an
// error, even though real rows existed in the database.
//
// The fix mirrors what redeem_invitation() (019_invitation_rpcs.sql)
// already does for the real invite-link flow: let the trigger create
// its rows, then UPDATE that profile to move it into THIS account
// (not a new one) and DELETE the orphan personal account the trigger
// made — instead of fighting the trigger, reuse its output.

const USERNAME_DOMAIN = 'buildmyweb.info'

function usernameToEmail(username: string): string {
  return `${username.toLowerCase()}@${USERNAME_DOMAIN}`
}

export async function GET() {
  try {
    const ctx = await requireRole('admin')
    const { data, error } = await ctx.supabase
      .from('profiles')
      .select('user_id, username, is_active, account_role, created_at')
      .eq('account_id', ctx.accountId)
      .not('username', 'is', null)
      .order('created_at', { ascending: false })
    if (error) throw error

    const users = (data ?? []).map((row) => ({
      user_id: row.user_id,
      username: row.username,
      is_active: row.is_active,
      role: row.account_role,
      created_at: row.created_at,
    }))
    return NextResponse.json({ users })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const isActive = body.is_active !== false

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 3-32 characters: letters, numbers, dot, underscore, or hyphen only' },
      { status: 400 },
    )
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const email = usernameToEmail(username)

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // A very long ban immediately at creation if the admin picked
    // "Inactive" up front — 'none' un-bans, any other value bans.
    ban_duration: isActive ? 'none' : '876000h',
  })

  if (createError || !created.user) {
    const message = createError?.message ?? 'Could not create the account'
    const status = message.toLowerCase().includes('already') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }

  // on_auth_user_created already ran (same-transaction AFTER INSERT
  // trigger, committed before the Admin API call above returned) —
  // fetch what it made so we know which orphan account to clean up.
  const { data: triggerProfile, error: fetchError } = await admin
    .from('profiles')
    .select('account_id')
    .eq('user_id', created.user.id)
    .maybeSingle()

  if (fetchError || !triggerProfile) {
    await admin.auth.admin.deleteUser(created.user.id)
    console.error('[users] could not find the trigger-created profile:', fetchError)
    return NextResponse.json({ error: 'Could not finish creating the account' }, { status: 500 })
  }

  const orphanAccountId = triggerProfile.account_id

  // Move the profile into THIS account instead of the fresh one the
  // trigger made — this is the actual "no separate data" fix.
  const { error: updateError } = await admin
    .from('profiles')
    .update({
      account_id: ctx.accountId,
      username,
      is_active: isActive,
      full_name: username,
      // Baseline coarse role for locally-created users (the trigger
      // sets 'owner', which would be wrong here — this user isn't
      // the owner of BMW's account). The granular per-page grid
      // (set in step 2 of the wizard) documents intended access, but
      // existing API routes still enforce THIS role, not that grid
      // — see 054_user_management.sql's header comment.
      account_role: 'employee',
    })
    .eq('user_id', created.user.id)

  if (updateError) {
    await admin.auth.admin.deleteUser(created.user.id)
    console.error('[users] profile reassignment failed:', updateError)
    return NextResponse.json({ error: 'Could not finish creating the account' }, { status: 500 })
  }

  // Clean up the orphan personal account the trigger made — safe:
  // the profile that referenced it was just moved out above, and
  // nothing else was ever created against a brand-new account in
  // the same instant, so this can't orphan any real data.
  if (orphanAccountId && orphanAccountId !== ctx.accountId) {
    const { error: cleanupError } = await admin.from('accounts').delete().eq('id', orphanAccountId)
    if (cleanupError) {
      // Non-fatal — the user account itself is fully correct at this
      // point; a leftover empty accounts row is just clutter, not a
      // functional problem. Log it so it can be cleaned up manually.
      console.error('[users] could not delete orphan account (non-fatal):', cleanupError)
    }
  }

  return NextResponse.json({ user_id: created.user.id, username }, { status: 201 })
}
