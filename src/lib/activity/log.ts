import { createClient } from "@/lib/supabase/client";

// sessionStorage (not localStorage) — deliberately scoped to this
// browser tab's lifetime, same as the login/logout pairing it exists
// for: closing the tab without an explicit sign-out just leaves the
// login row without a matching logout, which is the correct picture
// (no observed logout time, so no computed duration on the Activity
// Log page) rather than a guess.
const SESSION_KEY = "bmw-activity-session-id";

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Fire-and-forget activity log write — never throws, never blocks the
 * caller (sign-in/sign-out, a save) on logging succeeding. RLS lets
 * any account member insert their own rows (see
 * 067_followup_multi_assignee_activity_log.sql).
 */
export async function logActivity(entry: {
  accountId: string;
  userId: string | null;
  action: "login" | "logout" | "create" | "update" | "delete";
  entityType?: string;
  entityId?: string;
  description: string;
  sessionId?: string | null;
}) {
  try {
    const supabase = createClient();
    await supabase.from("activity_logs").insert({
      account_id: entry.accountId,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      description: entry.description,
      session_id: entry.sessionId ?? null,
    });
  } catch (err) {
    console.error("[activity-log] write failed:", err);
  }
}

/** Called from the auth state listener on EVERY event that carries a
 *  signed-in user (SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED) — not
 *  just SIGNED_IN, since a browser session that predates this feature
 *  (or that simply never signs out) would otherwise never log a
 *  single login. The sessionStorage marker below is what keeps this
 *  from writing a row on every one of those events: it only actually
 *  logs once per browser tab session, on whichever event is first to
 *  see a signed-in user with no marker set yet. Looks up the account
 *  itself since the profile hasn't necessarily resolved in
 *  AuthProvider yet. */
export async function logLogin(userId: string, email: string | null) {
  if (window.sessionStorage.getItem(SESSION_KEY)) return;
  // Claim the marker synchronously before the first await — two auth
  // events firing back-to-back (INITIAL_SESSION then TOKEN_REFRESHED)
  // would otherwise both pass the check above before either finishes.
  const sessionId = newSessionId();
  window.sessionStorage.setItem(SESSION_KEY, sessionId);

  const supabase = createClient();
  const { data: profileRow } = await supabase.from("profiles").select("account_id").eq("user_id", userId).maybeSingle();
  if (!profileRow?.account_id) {
    // Couldn't resolve an account yet — release the marker so the
    // next auth event (profile may not exist momentarily during
    // signup bootstrap) gets to retry instead of silently giving up.
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  window.sessionStorage.setItem(`${SESSION_KEY}-account`, profileRow.account_id);
  await logActivity({
    accountId: profileRow.account_id,
    userId,
    action: "login",
    description: `${email ?? "A user"} logged in`,
    sessionId,
  });
}

/** Called right before supabase.auth.signOut() actually tears down
 *  the session — logout has to be logged BEFORE sign-out completes,
 *  since RLS requires an authenticated request to insert the row. */
export async function logLogout(userId: string, email: string | null) {
  const sessionId = window.sessionStorage.getItem(SESSION_KEY);
  const accountId = window.sessionStorage.getItem(`${SESSION_KEY}-account`);
  if (!accountId) return;
  await logActivity({
    accountId,
    userId,
    action: "logout",
    description: `${email ?? "A user"} logged out`,
    sessionId,
  });
  window.sessionStorage.removeItem(SESSION_KEY);
  window.sessionStorage.removeItem(`${SESSION_KEY}-account`);
}
