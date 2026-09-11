"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertCircle, ArrowRight, CalendarClock, CheckCircle2, ChevronDown, Clock,
  Inbox, Loader2, MessageSquare, TrendingUp, Users
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { AccountMember } from "@/types";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// Types returned by /api/my-dashboard
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardTask {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  project?: { id: string; name: string; client?: { id: string; name: string } | null } | null;
}

interface FollowUp {
  id: string;
  title: string;
  next_follow_up_at: string;
  status: string;
  priority: string | null;
}

interface ProjectHealth {
  id: string;
  name: string;
  status: string;
  progress_percentage: number;
  due_date: string | null;
  client?: { id: string; name: string } | null;
}

interface DashboardData {
  stats: {
    task_count: number;
    followup_count: number;
    enquiry_count: number;
    project_count: number;
    month_revenue: number;
    unread_messages: number;
  };
  my_work: {
    overdue: DashboardTask[];
    due_today: DashboardTask[];
    upcoming: DashboardTask[];
    waiting: DashboardTask[];
  };
  followups: FollowUp[];
  project_health: ProjectHealth[];
  enquiry_pipeline: Record<string, number>;
  unread_dm_count: number;
  recent_activity: Array<{ id: string; action: string; entity_type: string; entity_name: string | null; created_at: string; user?: { full_name: string | null } }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-400",
};

const ENQUIRY_ORDER = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border px-4 py-2 ${color}`}>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function TaskRow({ task, type }: { task: DashboardTask; type: "overdue" | "today" | "upcoming" | "waiting" }) {
  const color = type === "overdue" ? "text-red-500" : type === "today" ? "text-amber-500" : "text-muted-foreground";
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        {task.project && (
          <p className="truncate text-xs text-muted-foreground">
            {task.project.client?.name ?? task.project.name}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {task.due_date && (
          <span className={`text-[11px] font-medium ${color}`}>
            {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
          </span>
        )}
        {task.priority && (
          <span className={`text-[10px] font-semibold uppercase ${PRIORITY_COLOR[task.priority] ?? "text-muted-foreground"}`}>
            {task.priority}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function MyWorkPage() {
  const { user, profile, accountId } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Fetch members once
  useEffect(() => {
    if (!accountId) return;
    fetch("/api/account/members")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.members) setMembers(d.members);
      });
  }, [accountId]);

  // Default selected user = logged-in user
  useEffect(() => {
    if (!selectedUserId && user?.id) setSelectedUserId(user.id);
  }, [user?.id, selectedUserId]);

  const load = useCallback(() => {
    if (!selectedUserId) return;
    setLoading(true);
    fetch(`/api/my-dashboard?user_id=${selectedUserId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) setData(d);
      })
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedMember = members.find((m) => m.user_id === selectedUserId);
  const displayName = selectedUserId === user?.id
    ? profile?.full_name ?? "You"
    : selectedMember?.full_name ?? "Team Member";

  const myWorkTabs = [
    { key: "overdue", label: "Overdue", tasks: data?.my_work.overdue ?? [], color: "text-red-500", count: data?.my_work.overdue.length ?? 0 },
    { key: "today", label: "Due Today", tasks: data?.my_work.due_today ?? [], color: "text-amber-500", count: data?.my_work.due_today.length ?? 0 },
    { key: "upcoming", label: "Upcoming", tasks: data?.my_work.upcoming ?? [], color: "text-blue-500", count: data?.my_work.upcoming.length ?? 0 },
    { key: "waiting", label: "No Date", tasks: data?.my_work.waiting ?? [], color: "text-muted-foreground", count: data?.my_work.waiting.length ?? 0 },
  ];
  const [workTab, setWorkTab] = useState("overdue");
  const activeWork = myWorkTabs.find((t) => t.key === workTab)!;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-6 p-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {greeting()}, {displayName} 👋
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          {/* Person filter */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm hover:bg-muted"
            >
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {showPicker && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-popover shadow-lg">
                <button
                  type="button"
                  onClick={() => { setSelectedUserId(user?.id ?? null); setShowPicker(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${selectedUserId === user?.id ? "font-semibold text-primary" : ""}`}
                >
                  {profile?.full_name ?? "Me"} (You)
                </button>
                {members.filter((m) => m.user_id !== user?.id).map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => { setSelectedUserId(m.user_id); setShowPicker(false); }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${selectedUserId === m.user_id ? "font-semibold text-primary" : ""}`}
                  >
                    {m.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Could not load dashboard.</p>
        ) : (
          <>
            {/* ── Stat pills ── */}
            <div className="flex flex-wrap gap-3">
              <StatPill label="Tasks" value={data.stats.task_count} color="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30" />
              <StatPill label="Follow-ups" value={data.stats.followup_count} color="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" />
              <StatPill label="Enquiries" value={data.stats.enquiry_count} color="border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/30" />
              <StatPill label="Projects" value={data.stats.project_count} color="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30" />
              <StatPill label="Month Revenue" value={`₹${fmt(data.stats.month_revenue)}`} color="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" />
              {data.stats.unread_messages > 0 && (
                <StatPill label="Unread Messages" value={data.stats.unread_messages} color="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30" />
              )}
            </div>

            {/* ── Main grid ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

              {/* ── My Work ── */}
              <div className="lg:col-span-2">
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="border-b border-border px-4 pt-4 pb-0">
                    <h2 className="mb-3 text-sm font-semibold text-foreground">My Work</h2>
                    <div className="flex gap-1">
                      {myWorkTabs.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setWorkTab(t.key)}
                          className={`flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            workTab === t.key
                              ? "border border-b-0 border-border bg-background text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span className={t.count > 0 ? t.color : ""}>{t.label}</span>
                          {t.count > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${t.color} bg-muted`}>
                              {t.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-4">
                    {activeWork.tasks.length === 0 ? (
                      <div className="flex flex-col items-center gap-1 py-8 text-center">
                        <CheckCircle2 className="h-8 w-8 text-green-400" />
                        <p className="text-sm text-muted-foreground">All clear!</p>
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        {activeWork.tasks.map((t) => (
                          <TaskRow key={t.id} task={t} type={activeWork.key as "overdue" | "today" | "upcoming" | "waiting"} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Right column ── */}
              <div className="flex flex-col gap-6">

                {/* Project Health */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <h2 className="text-sm font-semibold text-foreground">Project Health</h2>
                    <Link href="/projects" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                      All <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="divide-y divide-border px-4 pb-3">
                    {data.project_health.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">No active projects</p>
                    ) : data.project_health.slice(0, 5).map((p) => (
                      <div key={p.id} className="py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-foreground">{p.name}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{p.progress_percentage}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full transition-all ${
                              p.progress_percentage >= 80 ? "bg-green-500" :
                              p.progress_percentage >= 50 ? "bg-blue-500" :
                              p.progress_percentage >= 25 ? "bg-amber-500" : "bg-red-400"
                            }`}
                            style={{ width: `${p.progress_percentage}%` }}
                          />
                        </div>
                        {p.due_date && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            Due {new Date(p.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Enquiry Pipeline */}
                <div className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <h2 className="text-sm font-semibold text-foreground">Enquiry Pipeline</h2>
                    <Link href="/client-leads" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="px-4 pb-3">
                    {ENQUIRY_ORDER.filter((s) => data.enquiry_pipeline[s] > 0).map((status) => (
                      <div key={status} className="mb-2 flex items-center justify-between">
                        <span className="text-xs capitalize text-muted-foreground">{status.replace("_", " ")}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground">
                          {data.enquiry_pipeline[status]}
                        </span>
                      </div>
                    ))}
                    {Object.keys(data.enquiry_pipeline).length === 0 && (
                      <p className="py-3 text-center text-xs text-muted-foreground">No enquiries</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bottom grid ── */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">

              {/* Follow-ups */}
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <CalendarClock className="h-4 w-4 text-amber-500" /> Follow-ups
                  </h2>
                  <Link href="/client-leads" className="text-[11px] text-primary hover:underline">View all</Link>
                </div>
                <div className="divide-y divide-border px-4 pb-3">
                  {data.followups.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">No upcoming follow-ups</p>
                  ) : data.followups.slice(0, 6).map((f) => (
                    <div key={f.id} className="flex items-start justify-between py-2">
                      <p className="truncate text-xs font-medium text-foreground">{f.title}</p>
                      <span className="ml-2 shrink-0 text-[11px] text-amber-500">
                        {new Date(f.next_follow_up_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Needs Attention */}
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="px-4 pt-4 pb-2">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-red-500" /> Needs Attention
                  </h2>
                </div>
                <div className="divide-y divide-border px-4 pb-3">
                  {data.my_work.overdue.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">Nothing urgent right now</p>
                  ) : data.my_work.overdue.slice(0, 5).map((t) => (
                    <div key={t.id} className="flex items-start justify-between py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-red-500">{t.title}</p>
                        {t.project && <p className="truncate text-[10px] text-muted-foreground">{t.project.name}</p>}
                      </div>
                      {t.due_date && (
                        <span className="ml-2 shrink-0 text-[11px] text-red-400">
                          {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <div className="px-4 pt-4 pb-2">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-muted-foreground" /> Recent Activity
                  </h2>
                </div>
                <div className="divide-y divide-border px-4 pb-3">
                  {data.recent_activity.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">No recent activity</p>
                  ) : data.recent_activity.slice(0, 6).map((a) => (
                    <div key={a.id} className="py-2">
                      <p className="text-[11px] text-foreground">
                        <span className="font-medium">{a.user?.full_name ?? "Someone"}</span>{" "}
                        {a.action.toLowerCase().replace(/_/g, " ")}{" "}
                        {a.entity_name && <span className="text-muted-foreground">{a.entity_name}</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(a.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                        {" · "}
                        {new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Messages shortcut ── */}
            {data.stats.unread_messages > 0 && (
              <Link
                href="/messages"
                className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 shadow-sm hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400"
              >
                <Inbox className="h-5 w-5 shrink-0" />
                <span>
                  You have <strong>{data.stats.unread_messages}</strong> unread message{data.stats.unread_messages !== 1 ? "s" : ""}
                </span>
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
