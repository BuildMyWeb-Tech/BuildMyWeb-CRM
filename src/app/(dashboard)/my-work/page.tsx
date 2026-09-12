"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowRight, Calendar, CheckCircle2, ChevronDown,
  Clock, Folder, Loader2, MessageSquare,
  Users, CheckSquare, IndianRupee, Plus, ExternalLink,
  AlertCircle, Inbox, ClipboardList, BellRing,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { AccountMember } from "@/types";
import Link from "next/link";

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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/20 border-red-500/30",
  high: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  normal: "text-slate-400 bg-slate-500/20 border-slate-500/30",
};

function DonutChart({ segments }: { segments: { label: string; count: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-xs text-slate-500">No projects</p>
      </div>
    );
  }
  const size = 120; const strokeWidth = 18;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2; const cy = size / 2;
  let offset = 0;
  const arcs = segments.filter((s) => s.count > 0).map((seg) => {
    const pct = seg.count / total;
    const dash = pct * circ;
    const gap = circ - dash;
    const arc = { ...seg, dash, gap, offset };
    offset += dash;
    return arc;
  });
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a3045" strokeWidth={strokeWidth} />
          {arcs.map((arc, i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={arc.color} strokeWidth={strokeWidth}
              strokeDasharray={`${arc.dash} ${arc.gap}`} strokeDashoffset={-arc.offset} />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-white">{total}</span>
          <span className="text-[10px] text-slate-500">Total</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
              <span className="text-xs text-slate-400">{seg.label}</span>
            </div>
            <span className="text-xs font-bold text-white">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type WorkTab = "all" | "project-tasks" | "enquiry-tasks" | "product-tasks";

const WORK_TABS: { key: WorkTab; label: string }[] = [
  { key: "all", label: "All Works" },
  { key: "project-tasks", label: "Project Tasks" },
  { key: "enquiry-tasks", label: "Enquiry Tasks" },
  { key: "product-tasks", label: "Product Tasks" },
];

const PIPELINE_STAGES = [
  { key: "new", label: "New", color: "bg-blue-500" },
  { key: "in_discussion", label: "Discussion", color: "bg-teal-500" },
  { key: "hold", label: "Hold", color: "bg-yellow-500" },
  { key: "confirmed", label: "Converted", color: "bg-green-500" },
  { key: "rejected", label: "Rejected", color: "bg-red-500" },
];

export default function MyWorkPage() {
  const { user, profile, accountId } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [workTab, setWorkTab] = useState<WorkTab>("all");
  const [todoItems, setTodoItems] = useState([
    { id: "1", text: "Call supplier", done: false },
    { id: "2", text: "Review proposal", done: false },
    { id: "3", text: "Send logo assets", done: true },
    { id: "4", text: "Update website copy", done: false },
  ]);
  const [newTodo, setNewTodo] = useState("");
  const [addingTodo, setAddingTodo] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    fetch("/api/account/members")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.members) setMembers(d.members); });
  }, [accountId]);

  useEffect(() => {
    if (!selectedUserId && user?.id) setSelectedUserId(user.id);
  }, [user?.id, selectedUserId]);

  const load = useCallback(() => {
    if (!selectedUserId) return;
    setLoading(true);
    fetch(`/api/my-dashboard?user_id=${selectedUserId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  useEffect(() => { load(); }, [load]);

  const selectedMember = members.find((m) => m.user_id === selectedUserId);
  const displayName = selectedUserId === user?.id
    ? profile?.full_name ?? "You"
    : selectedMember?.full_name ?? "Team Member";

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "short", year: "numeric",
  });
  const todayStr = new Date().toISOString().slice(0, 10);

  const allTasksRaw = data ? [
    ...data.my_work.overdue,
    ...data.my_work.due_today,
    ...data.my_work.upcoming,
    ...data.my_work.waiting,
  ] : [];

  // Filter tasks by selected user (assignee) when not viewing own dashboard
  const isOwnDashboard = !selectedUserId || selectedUserId === user?.id;
  const taskItems = isOwnDashboard ? allTasksRaw : allTasksRaw.filter((t) => {
    const ids = (t as { assignee_user_ids?: string[] }).assignee_user_ids ?? [];
    return t.assignee_user_id === selectedUserId || ids.includes(selectedUserId ?? "");
  });

  const followupItems = data?.followups ?? [];
  const enquiryTotal = Object.values(data?.enquiry_pipeline ?? {}).reduce((a, b) => a + b, 0);

  const activeTab_tasks = workTab === "all" || workTab === "project-tasks" ? taskItems : [];
  const activeTab_followups = workTab === "all" || workTab === "enquiry-tasks" ? followupItems : [];

  const healthSegments = (() => {
    if (!data) return [];
    const healthy = data.project_health.filter((p) => p.progress_percentage >= 60 && p.status !== "on_hold").length;
    const atRisk = data.project_health.filter((p) => p.progress_percentage >= 25 && p.progress_percentage < 60).length;
    const delayed = data.project_health.filter((p) => p.progress_percentage < 25 && p.status !== "on_hold").length;
    const onHold = data.project_health.filter((p) => p.status === "on_hold").length;
    return [
      { label: "Healthy", count: healthy, color: "#22c55e" },
      { label: "At Risk", count: atRisk, color: "#eab308" },
      { label: "Delayed", count: delayed, color: "#ef4444" },
      { label: "On Hold", count: onHold, color: "#64748b" },
    ];
  })();

  const overdueTasks = data?.my_work.overdue ?? [];
  const dueTodayTasks = data?.my_work.due_today ?? [];
  const upcomingTasks = data?.my_work.upcoming ?? [];

  // Upcoming deadlines — next 7 days
  const upcomingDeadlines = [...dueTodayTasks, ...upcomingTasks].slice(0, 5);

  function toggleTodo(id: string) {
    setTodoItems((prev) => prev.map((item) => item.id === id ? { ...item, done: !item.done } : item));
  }
  function addTodo() {
    if (!newTodo.trim()) return;
    setTodoItems((prev) => [...prev, { id: Date.now().toString(), text: newTodo.trim(), done: false }]);
    setNewTodo("");
    setAddingTodo(false);
  }

  // Tab counts
  const tabCounts: Record<WorkTab, number> = {
    all: taskItems.length + followupItems.length,
    "project-tasks": taskItems.length,
    "enquiry-tasks": followupItems.length,
    "product-tasks": 0,
  };

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="space-y-6 p-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">
              👋 {greeting()}, {displayName}!
            </h1>
            <p className="mt-1 text-sm text-slate-400">Here&apos;s what needs your attention today. Stay productive!</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300">
              <Calendar className="h-4 w-4 text-slate-500" />
              {today}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPicker((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 hover:border-[#3a4055] transition-colors"
              >
                <Users className="h-4 w-4 text-slate-500" />
                <span>{displayName}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>
              {showPicker && (
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-[#2a3045] bg-[#1a1f2e] shadow-xl">
                  <button type="button"
                    onClick={() => { setSelectedUserId(user?.id ?? null); setShowPicker(false); }}
                    className={`w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-[#2a3045] transition-colors ${selectedUserId === user?.id ? "font-semibold text-blue-400" : ""}`}>
                    {profile?.full_name ?? "Me"} (You)
                  </button>
                  {members.filter((m) => m.user_id !== user?.id).map((m) => (
                    <button key={m.user_id} type="button"
                      onClick={() => { setSelectedUserId(m.user_id); setShowPicker(false); }}
                      className={`w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-[#2a3045] transition-colors ${selectedUserId === m.user_id ? "font-semibold text-blue-400" : ""}`}>
                      {m.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : !data ? (
          <p className="text-sm text-slate-400">Could not load dashboard.</p>
        ) : (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                    <CheckSquare className="h-5 w-5 text-blue-400" />
                  </div>
                  <Link href="/daily-tasks" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a3045] text-slate-500 hover:text-white transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <p className="mt-3 text-2xl font-bold text-white">{data.stats.task_count}</p>
                <p className="text-sm text-slate-400">My Tasks</p>
                {overdueTasks.length > 0 && <p className="mt-0.5 text-xs text-red-400">{overdueTasks.length} overdue</p>}
              </div>

              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                    <BellRing className="h-5 w-5 text-purple-400" />
                  </div>
                  <Link href="/client-leads" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a3045] text-slate-500 hover:text-white transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <p className="mt-3 text-2xl font-bold text-white">{data.stats.followup_count}</p>
                <p className="text-sm text-slate-400">Follow-ups</p>
                {dueTodayTasks.length > 0 && <p className="mt-0.5 text-xs text-orange-400">{dueTodayTasks.length} today</p>}
              </div>

              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                    <Inbox className="h-5 w-5 text-green-400" />
                  </div>
                  <Link href="/client-leads" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a3045] text-slate-500 hover:text-white transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <p className="mt-3 text-2xl font-bold text-white">{data.stats.enquiry_count}</p>
                <p className="text-sm text-slate-400">Enquiries</p>
                <p className="mt-0.5 text-xs text-green-400">{data.enquiry_pipeline["new"] ?? 0} new</p>
              </div>

              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
                    <Folder className="h-5 w-5 text-orange-400" />
                  </div>
                  <Link href="/projects" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a3045] text-slate-500 hover:text-white transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <p className="mt-3 text-2xl font-bold text-white">{data.stats.project_count}</p>
                <p className="text-sm text-slate-400">Projects</p>
                {data.project_health.filter((p) => p.progress_percentage < 25).length > 0 && (
                  <p className="mt-0.5 text-xs text-yellow-400">{data.project_health.filter((p) => p.progress_percentage < 25).length} at risk</p>
                )}
              </div>

              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/20">
                    <IndianRupee className="h-5 w-5 text-teal-400" />
                  </div>
                  <Link href="/payments" className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#2a3045] text-slate-500 hover:text-white transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <p className="mt-3 text-xl font-bold text-white">₹{fmt(data.stats.month_revenue)}</p>
                <p className="text-sm text-slate-400">Revenue (Pending)</p>
                <p className="mt-0.5 text-xs text-slate-500">This month</p>
              </div>
            </div>

            {/* Main 3-column grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

              {/* My Work — col-span-2 */}
              <div className="lg:col-span-2 rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#2a3045] px-4 py-3">
                  <h2 className="font-semibold text-white">My Work</h2>
                  <Link href="/daily-tasks" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                    View all <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                {/* Sub-tabs */}
                <div className="flex items-center gap-0.5 border-b border-[#2a3045] px-4 pt-1 overflow-x-auto">
                  {WORK_TABS.map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setWorkTab(tab.key)}
                      className={`flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                        workTab === tab.key ? "border-blue-500 text-white" : "border-transparent text-slate-500 hover:text-white"
                      }`}>
                      {tab.label}
                      {tabCounts[tab.key] > 0 && (
                        <span className={`rounded-full px-1.5 text-[10px] font-bold ${
                          tab.key === "project-tasks" && overdueTasks.length > 0 ? "bg-red-500/20 text-red-400"
                          : "bg-[#2a3045] text-slate-400"
                        }`}>{tabCounts[tab.key]}</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-[#2a3045] max-h-80 overflow-y-auto">
                  {/* Tasks section */}
                  {(workTab === "all" || workTab === "project-tasks") && taskItems.length > 0 && (
                    <>
                      {workTab === "all" && (
                        <div className="px-4 py-1.5 bg-[#161b27]">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Project Tasks</p>
                        </div>
                      )}
                      {taskItems.map((task) => {
                        const isOverdue = data.my_work.overdue.some((t) => t.id === task.id);
                        const isToday = data.my_work.due_today.some((t) => t.id === task.id);
                        return (
                          <div key={`t-${task.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#1e2436] transition-colors">
                            <div className={`h-2 w-2 shrink-0 rounded-full ${isOverdue ? "bg-red-400" : isToday ? "bg-amber-400" : "bg-blue-400"}`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-white">{task.title}</p>
                              {task.project && (
                                <p className="truncate text-xs text-slate-500">{task.project.client?.name ?? task.project.name}</p>
                              )}
                            </div>
                            {task.priority && (
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[task.priority] ?? "text-slate-400 bg-slate-500/20 border-slate-500/30"}`}>
                                {task.priority}
                              </span>
                            )}
                            {task.due_date && (
                              <span className={`shrink-0 text-[11px] font-medium ${isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-slate-500"}`}>
                                {isToday ? "Today" : new Date(task.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Follow-ups section */}
                  {(workTab === "all" || workTab === "enquiry-tasks") && activeTab_followups.length > 0 && (
                    <>
                      {workTab === "all" && (
                        <div className="px-4 py-1.5 bg-[#161b27]">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Enquiry Follow-ups</p>
                        </div>
                      )}
                      {activeTab_followups.slice(0, workTab === "all" ? 3 : undefined).map((f) => {
                        const fDate = new Date(f.next_follow_up_at);
                        const isOverdue = fDate < new Date();
                        const isToday = fDate.toDateString() === new Date().toDateString();
                        return (
                          <div key={`f-${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#1e2436] transition-colors">
                            <div className={`h-2 w-2 shrink-0 rounded-full ${isOverdue ? "bg-red-400" : isToday ? "bg-amber-400" : "bg-purple-400"}`} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-white">{f.title}</p>
                              <p className="text-xs text-slate-500 capitalize">{f.status}</p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              isOverdue ? "text-red-400 bg-red-500/20 border-red-500/30"
                              : isToday ? "text-amber-400 bg-amber-500/20 border-amber-500/30"
                              : "text-purple-400 bg-purple-500/20 border-purple-500/30"
                            }`}>
                              {isOverdue ? "Overdue" : isToday ? "Today" : fDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Product Tasks section */}
                  {workTab === "product-tasks" && (
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                      <Link href="/product-tasks" className="flex items-center gap-2 text-sm text-teal-400 hover:underline">
                        <ExternalLink className="h-4 w-4" /> View Product Tasks
                      </Link>
                    </div>
                  )}

                  {/* Empty state */}
                  {workTab !== "product-tasks"
                    && taskItems.length === 0 && activeTab_followups.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                      <p className="text-sm text-slate-500">All clear in this category!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Today's Schedule + Upcoming Deadlines */}
              <div className="flex flex-col gap-4">
                {/* Upcoming Deadlines */}
                <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[#2a3045] px-4 py-3">
                    <h2 className="flex items-center gap-1.5 font-semibold text-white">
                      <AlertCircle className="h-4 w-4 text-orange-400" /> Upcoming Deadlines
                    </h2>
                    <Link href="/daily-tasks" className="text-xs text-blue-400 hover:underline">View all</Link>
                  </div>
                  <div className="divide-y divide-[#2a3045]">
                    {upcomingDeadlines.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-slate-500">No upcoming deadlines</p>
                    ) : upcomingDeadlines.map((task) => {
                      const isToday = task.due_date === todayStr;
                      const dDate = task.due_date ? new Date(task.due_date + "T00:00:00") : null;
                      return (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white ${
                            isToday ? "bg-amber-500/30 text-amber-300" : "bg-blue-500/20 text-blue-400"
                          }`}>
                            {dDate ? dDate.getDate() : "—"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-200">{task.title}</p>
                            <p className="text-[10px] text-slate-500">{dDate?.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</p>
                          </div>
                          {task.priority && (
                            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold capitalize ${PRIORITY_COLOR[task.priority] ?? ""}`}>
                              {task.priority}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Project Health */}
                <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[#2a3045] px-4 py-3">
                    <h2 className="font-semibold text-white">Project Health</h2>
                    <Link href="/projects" className="text-xs text-blue-400 hover:underline">View all</Link>
                  </div>
                  <div className="p-4"><DonutChart segments={healthSegments} /></div>
                </div>
              </div>
            </div>

            {/* Bottom grid */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">

              {/* Follow-ups */}
              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#2a3045] px-4 py-3">
                  <h2 className="font-semibold text-white">Follow-ups</h2>
                  <Link href="/client-leads" className="text-xs text-blue-400 hover:underline">View all</Link>
                </div>
                <div className="divide-y divide-[#2a3045]">
                  {followupItems.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-500">No upcoming follow-ups</p>
                  ) : followupItems.slice(0, 5).map((f) => {
                    const fDate = new Date(f.next_follow_up_at);
                    const isOverdue = fDate < new Date();
                    const isToday = fDate.toDateString() === new Date().toDateString();
                    return (
                      <div key={f.id} className="px-4 py-3">
                        <p className="truncate text-sm font-medium text-white">{f.title}</p>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 capitalize">{f.status}</span>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                            isOverdue ? "bg-red-500/20 text-red-400 border-red-500/30"
                            : isToday ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          }`}>
                            {isOverdue ? "Overdue" : isToday ? "Today" : fDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Enquiry Pipeline */}
              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#2a3045] px-4 py-3">
                  <h2 className="font-semibold text-white">Enquiry Pipeline</h2>
                  <Link href="/client-leads" className="text-xs text-blue-400 hover:underline">View all</Link>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {PIPELINE_STAGES.map((stage) => {
                      const count = data.enquiry_pipeline[stage.key] ?? 0;
                      return (
                        <span key={stage.key} className={`rounded-full px-2.5 py-1 text-xs font-semibold text-white ${stage.color}/70`}>
                          {stage.label} {count}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-2 rounded-lg bg-[#1e2436] p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Today</p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                      {data.enquiry_pipeline["new"] ?? 0} new enquiries
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {followupItems.filter((f) => new Date(f.next_follow_up_at).toDateString() === new Date().toDateString()).length} follow-ups due
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      {followupItems.filter((f) => new Date(f.next_follow_up_at) < new Date()).length} overdue
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#2a3045] px-4 py-3">
                  <h2 className="flex items-center gap-1.5 font-semibold text-white">
                    <Clock className="h-4 w-4 text-slate-500" /> Recent Activity
                  </h2>
                  <Link href="/activity" className="text-xs text-blue-400 hover:underline">View all</Link>
                </div>
                <div className="divide-y divide-[#2a3045]">
                  {data.recent_activity.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-500">No recent activity</p>
                  ) : data.recent_activity.slice(0, 5).map((a) => (
                    <div key={a.id} className="flex items-start gap-2 px-4 py-2.5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[9px] font-bold text-purple-400">
                        {getInitials(a.user?.full_name ?? "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-slate-300">
                          <span className="font-medium text-white">{a.user?.full_name ?? "Someone"}</span>{" "}
                          {a.action.toLowerCase().replace(/_/g, " ")}
                        </p>
                        <p className="text-[10px] text-slate-600">{timeAgo(a.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* My To-Do */}
              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#2a3045] px-4 py-3">
                  <h2 className="font-semibold text-white">My To-Do</h2>
                  <button type="button" onClick={() => setAddingTodo(true)}
                    className="flex items-center gap-1 rounded-lg bg-blue-600/20 px-2 py-1 text-[11px] font-medium text-blue-400 hover:bg-blue-600/30 transition-colors">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                <div className="p-3 space-y-1.5">
                  {todoItems.map((item) => (
                    <button key={item.id} type="button" onClick={() => toggleTodo(item.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-[#1e2436] transition-colors">
                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        item.done ? "border-green-500 bg-green-500/20" : "border-[#2a3045]"
                      }`}>
                        {item.done && <CheckCircle2 className="h-3 w-3 text-green-400" />}
                      </div>
                      <span className={`text-sm ${item.done ? "line-through text-slate-600" : "text-slate-300"}`}>{item.text}</span>
                    </button>
                  ))}
                  {addingTodo && (
                    <div className="flex items-center gap-1.5">
                      <input autoFocus value={newTodo} onChange={(e) => setNewTodo(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addTodo(); if (e.key === "Escape") setAddingTodo(false); }}
                        placeholder="New task..."
                        className="flex-1 rounded-lg border border-[#2a3045] bg-[#1e2436] px-2 py-1 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 outline-none" />
                      <button type="button" onClick={addTodo} className="text-blue-400 hover:text-blue-300 text-xs font-medium">Add</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Unread messages banner */}
            {data.stats.unread_messages > 0 && (
              <Link href="/messages"
                className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-400 hover:bg-blue-500/15 transition-colors">
                <MessageSquare className="h-5 w-5 shrink-0" />
                <span>You have <strong>{data.stats.unread_messages}</strong> unread message{data.stats.unread_messages !== 1 ? "s" : ""}</span>
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
