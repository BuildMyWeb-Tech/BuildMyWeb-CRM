"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, LogIn, LogOut, Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAccountMembers } from "@/hooks/use-account-members";

interface ActivityLogRow {
  id: string;
  account_id: string;
  user_id: string | null;
  action: "login" | "logout" | "create" | "update" | "delete";
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  session_id: string | null;
  created_at: string;
}

const ACTION_ICON: Record<ActivityLogRow["action"], typeof LogIn> = {
  login: LogIn,
  logout: LogOut,
  create: Plus,
  update: Pencil,
  delete: Trash2,
};

const ACTION_STYLE: Record<ActivityLogRow["action"], string> = {
  login: "bg-emerald-500/15 text-emerald-500",
  logout: "bg-muted text-muted-foreground",
  create: "bg-primary/10 text-primary",
  update: "bg-amber-500/15 text-amber-500",
  delete: "bg-red-500/15 text-red-400",
};

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

// Office → Activity Log. Who logged in/out (with session duration —
// paired by session_id) and their major create/update/delete actions
// across the account. Written client-side the instant it happens
// (see src/lib/activity/log.ts) — this page only ever reads.
export default function ActivityLogPage() {
  const { accountId } = useAuth();
  const { members } = useAccountMembers();
  const [rows, setRows] = useState<ActivityLogRow[] | null>(null);
  const [userFilter, setUserFilter] = useState<"all" | string>("all");

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from("activity_logs")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!error) setRows((data ?? []) as ActivityLogRow[]);
      });
  }, [accountId]);

  const membersById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  // Pair each logout back to its login (same session_id) so the
  // duration between them can be shown next to the logout row.
  const loginBySession = useMemo(() => {
    const map = new Map<string, ActivityLogRow>();
    for (const r of rows ?? []) {
      if (r.action === "login" && r.session_id) map.set(r.session_id, r);
    }
    return map;
  }, [rows]);

  const visibleRows = (rows ?? []).filter((r) => userFilter === "all" || r.user_id === userFilter);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Clock className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Activity Log</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Who logged in/out, session duration, and key actions across the account.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setUserFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            userFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          Everyone
        </button>
        {members.map((m) => (
          <button
            key={m.user_id}
            type="button"
            onClick={() => setUserFilter(m.user_id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              userFilter === m.user_id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.full_name}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Details</th>
                <th className="px-3 py-2 font-medium">Session duration</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const Icon = ACTION_ICON[row.action];
                const login = row.action === "logout" && row.session_id ? loginBySession.get(row.session_id) : null;
                const duration = login ? new Date(row.created_at).getTime() - new Date(login.created_at).getTime() : null;
                return (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-3 py-2 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-foreground">{row.user_id ? membersById.get(row.user_id)?.full_name ?? "Unknown" : "System"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${ACTION_STYLE[row.action]}`}>
                        <Icon className="h-3 w-3" />
                        {row.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.description}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {duration !== null ? formatDuration(duration) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
