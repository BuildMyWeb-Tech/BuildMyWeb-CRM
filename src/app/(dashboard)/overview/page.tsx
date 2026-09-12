"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Folder, Search, ClipboardList,
  ExternalLink, ListChecks, Package,
  ChevronUp, ChevronDown, ChevronsUpDown,
  UserCheck, XCircle, Clock,
  Users, ChevronDown as ChevronDownIcon, AlertCircle, Briefcase,
  Plus, Loader2, Zap, ArrowRight, CheckCircle2,
  Eye, EyeOff, Pencil, Trash2, X as XIcon,
  CalendarClock, MessageCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { UnifiedTasksView } from "@/components/daily-tasks/unified-tasks-view";
import Link from "next/link";
import type { Project, AccountMember } from "@/types";
import { toast } from "sonner";

const PROJECT_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-teal-500", "bg-orange-500",
  "bg-pink-500", "bg-green-500", "bg-yellow-500", "bg-red-500",
];
function getProjectColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return PROJECT_COLORS[Math.abs(h) % PROJECT_COLORS.length];
}

interface ProjectWithTaskCount extends Project { task_count?: number }

interface ClientLead {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  phone?: string | null;
  allocated_user_id?: string | null;
  allocated_user_ids?: string[];
}

interface ProductTask {
  id: string;
  title: string;
  priority: string;
  due_date: string | null;
  product_id: string | null;
  stage_id?: string | null;
  assignee_user_id?: string | null;
  assignee_user_ids?: string[];
  product?: { id: string; project_name?: string; name?: string } | null;
}

interface PtProduct { id: string; project_name: string }
interface PtStage { id: string; name: string }

interface PtModalState {
  mode: "create" | "edit";
  id?: string;
  title: string;
  priority: string;
  due_date: string;
  product_id: string;
  stage_id: string;
}

interface EnqModalState {
  title: string;
  phone: string;
}

interface MyWorkTask {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  show_date?: string | null;
  assignee_user_id?: string | null;
  assignee_user_ids?: string[];
  project?: { id: string; name: string } | null;
  stage?: { name: string } | null;
}
interface MyWorkFollowUp {
  id: string;
  title: string;
  next_follow_up_at: string;
  status: string;
  priority: string | null;
}

type TabKey = "my-work" | "project-tasks" | "enquiry-tasks" | "product-tasks" | "task-automation";
type SortDir = "asc" | "desc";
type EnqSortField = "title" | "status" | "priority" | "next_follow_up_at";
type PtSortField = "title" | "priority" | "due_date";

const TABS: { key: TabKey; label: string; icon: typeof ListChecks }[] = [
  { key: "my-work",         label: "My Work",         icon: Briefcase },
  { key: "project-tasks",   label: "Project Tasks",   icon: ListChecks },
  { key: "enquiry-tasks",   label: "Enquiry Tasks",   icon: ClipboardList },
  { key: "product-tasks",   label: "Product Tasks",   icon: Package },
  { key: "task-automation", label: "Task Automation", icon: Zap },
];

const ENQUIRY_STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  in_discussion: "bg-teal-500/20 text-teal-400",
  hold: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
  future_client: "bg-purple-500/20 text-purple-400",
};
const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-slate-500/20 text-slate-400",
};
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/20 border-red-500/30",
  high: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  normal: "text-slate-400 bg-slate-500/20 border-slate-500/30",
};
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function SortTh({ label, field, sortField, sortDir, onSort }: {
  label: string; field: string; sortField: string; sortDir: SortDir; onSort: (f: string) => void;
}) {
  return (
    <th className="px-4 py-2.5 font-medium">
      <button type="button" onClick={() => onSort(field)} className="flex items-center gap-1 hover:text-slate-300 transition-colors">
        {label}
        {sortField === field
          ? sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-blue-400" /> : <ChevronDown className="h-3 w-3 text-blue-400" />
          : <ChevronsUpDown className="h-3 w-3 text-slate-600" />}
      </button>
    </th>
  );
}

function saveSort(key: string, field: string, dir: SortDir) {
  try { localStorage.setItem(`ov-sort-${key}-field`, field); localStorage.setItem(`ov-sort-${key}-dir`, dir); } catch {}
}
function loadSort(key: string, defaultField: string): [string, SortDir] {
  try {
    const f = localStorage.getItem(`ov-sort-${key}-field`) ?? defaultField;
    const d = (localStorage.getItem(`ov-sort-${key}-dir`) ?? "asc") as SortDir;
    return [f, d];
  } catch { return [defaultField, "asc"]; }
}

// ── People picker ─────────────────────────────────────────────────────────────
function PeoplePicker({
  members, value, onChange, currentUserId, currentUserName, label = "All People",
}: {
  members: AccountMember[];
  value: string | null;
  onChange: (v: string | null) => void;
  currentUserId?: string;
  currentUserName?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? members.find((m) => m.user_id === value) : null;
  const displayName = !value ? label
    : value === currentUserId ? (currentUserName ?? "Me")
    : (selected?.full_name ?? "Team Member");

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          value ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : "border-[#2a3045] bg-[#1a1f2e] text-slate-400 hover:text-slate-200"
        }`}>
        <Users className="h-3.5 w-3.5" />
        <span>{displayName}</span>
        <ChevronDownIcon className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[#2a3045] bg-[#1a1f2e] shadow-xl">
          <button type="button" onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full px-3 py-2 text-left text-sm hover:bg-[#2a3045] transition-colors rounded-t-lg ${!value ? "font-semibold text-blue-400" : "text-slate-300"}`}>
            All People
          </button>
          {currentUserId && (
            <button type="button" onClick={() => { onChange(currentUserId); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-[#2a3045] transition-colors ${value === currentUserId ? "font-semibold text-blue-400" : "text-slate-300"}`}>
              {currentUserName ?? "Me"} (You)
            </button>
          )}
          {members.filter((m) => m.user_id !== currentUserId).map((m) => (
            <button key={m.user_id} type="button" onClick={() => { onChange(m.user_id); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-[#2a3045] transition-colors ${value === m.user_id ? "font-semibold text-blue-400" : "text-slate-300"}`}>
              {m.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Projects sidebar ──────────────────────────────────────────────────────────
function ProjectsSidebar({
  projects, loading, search, setSearch,
}: {
  projects: ProjectWithTaskCount[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
}) {
  const lower = search.toLowerCase();
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(lower));
  const active = filtered.filter((p) => p.status === "active").sort((a, b) => (b.task_count ?? 0) - (a.task_count ?? 0));
  const inactive = filtered.filter((p) => p.status === "inactive").sort((a, b) => a.name.localeCompare(b.name));
  const archived = filtered.filter((p) => p.status === "archived").sort((a, b) => a.name.localeCompare(b.name));

  function ProjectRow({ project }: { project: ProjectWithTaskCount }) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[#0f1117] transition-colors group">
        <span className={`h-6 w-6 shrink-0 rounded ${getProjectColor(project.name)} flex items-center justify-center text-[10px] font-bold text-white`}>
          {project.name.charAt(0).toUpperCase()}
        </span>
        <Link href={`/projects/${project.id}`} className="flex-1 truncate text-xs text-slate-300 group-hover:text-white">
          {project.name}
        </Link>
        {(project.task_count ?? 0) > 0 && (
          <span className="shrink-0 text-[10px] font-medium text-slate-500">{project.task_count}</span>
        )}
        <Link href={`/projects/chat?project=${project.id}`} title="Open project chat"
          className="shrink-0 rounded p-0.5 text-slate-600 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100">
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="shrink-0 px-4 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Folder className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Projects</h2>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {[
            { label: "Active",   count: projects.filter((p) => p.status === "active").length,   color: "text-blue-400" },
            { label: "Inactive", count: projects.filter((p) => p.status === "inactive").length, color: "text-slate-400" },
            { label: "Archived", count: projects.filter((p) => p.status === "archived").length, color: "text-slate-500" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-[#0f1117] px-2 py-1.5 text-center">
              <p className={`text-sm font-bold ${s.color}`}>{s.count}</p>
              <p className="text-[9px] text-slate-600">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input type="text" placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg bg-[#0f1117] border border-[#2a3045] pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 pb-4 space-y-3" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Active</p>
                {active.map((p) => <ProjectRow key={p.id} project={p} />)}
              </div>
            )}
            {inactive.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Inactive</p>
                {inactive.map((p) => <ProjectRow key={p.id} project={p} />)}
              </div>
            )}
            {archived.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Archived</p>
                {archived.map((p) => <ProjectRow key={p.id} project={p} />)}
              </div>
            )}
            {active.length === 0 && inactive.length === 0 && archived.length === 0 && (
              <p className="text-center text-xs text-slate-600 py-6">
                {search ? "No projects match your search" : "No projects yet"}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Followups section (My Work) ───────────────────────────────────────────────
function FollowupsSection({ followups }: { followups: MyWorkFollowUp[] }) {
  const [showHold, setShowHold] = useState(false);
  const discussion = followups.filter((f) => f.status === "in_discussion");
  const hold = followups.filter((f) => f.status === "hold");
  const other = followups.filter((f) => f.status !== "in_discussion" && f.status !== "hold");
  const visible = [...discussion, ...other, ...(showHold ? hold : [])];

  function FollowupRow({ f }: { f: MyWorkFollowUp }) {
    const fDate = new Date(f.next_follow_up_at);
    const isOverdueF = fDate < new Date();
    const isTodayF = fDate.toDateString() === new Date().toDateString();
    return (
      <tr className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
        <td className="px-4 py-3 font-medium text-white">{f.title}</td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${ENQUIRY_STATUS_STYLE[f.status] ?? "bg-slate-500/20 text-slate-400"}`}>
            {f.status.replace("_", " ")}
          </span>
        </td>
        <td className="px-4 py-3">
          {f.priority ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[f.priority] ?? ""}`}>{f.priority}</span>
          ) : <span className="text-slate-600">—</span>}
        </td>
        <td className={`px-4 py-3 text-xs font-medium ${isOverdueF ? "text-red-400" : isTodayF ? "text-amber-400" : "text-slate-400"}`}>
          {isTodayF ? "Today" : isOverdueF ? `Overdue · ${fDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : fDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
        </td>
      </tr>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Enquiry Follow-ups</h3>
      <div className="overflow-hidden rounded-xl border border-[#2a3045]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500 bg-[#1a1f2e]">
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => <FollowupRow key={f.id} f={f} />)}
          </tbody>
        </table>
        {hold.length > 0 && (
          <button type="button" onClick={() => setShowHold((v) => !v)}
            className="w-full flex items-center justify-center gap-1 border-t border-[#2a3045] py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ChevronDown className={`h-3 w-3 transition-transform ${showHold ? "rotate-180" : ""}`} />
            {showHold ? "Hide" : `Show ${hold.length} hold`}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Enquiry sidebar ───────────────────────────────────────────────────────────
function EnquirySidebar({ enquiries, members, todayStr }: {
  enquiries: ClientLead[];
  members: AccountMember[];
  todayStr: string;
}) {
  const total = enquiries.length;
  const discussion = enquiries.filter((e) => e.status === "in_discussion").length;
  const hold = enquiries.filter((e) => e.status === "hold").length;
  const confirmed = enquiries.filter((e) => e.status === "confirmed").length;
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000);
  const overdueEnq = enquiries.filter((e) => e.next_follow_up_at && new Date(e.next_follow_up_at) < now);
  const upcomingEnq = enquiries.filter((e) => {
    if (!e.next_follow_up_at) return false;
    const d = new Date(e.next_follow_up_at);
    return d >= now && d <= weekAhead;
  }).slice(0, 6);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "Total",      count: total,      color: "text-blue-400" },
          { label: "Discussion", count: discussion, color: "text-teal-400" },
          { label: "Hold",       count: hold,       color: "text-yellow-400" },
          { label: "Converted",  count: confirmed,  color: "text-green-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-[#0f1117] px-2 py-2 text-center">
            <p className={`text-sm font-bold ${s.color}`}>{s.count}</p>
            <p className="text-[9px] text-slate-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      {/* Overdue follow-ups */}
      {overdueEnq.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-red-500/20 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs font-semibold text-red-300">Overdue Follow-ups</span>
            <span className="ml-auto text-[10px] font-bold text-red-400">{overdueEnq.length}</span>
          </div>
          <div className="divide-y divide-red-500/10">
            {overdueEnq.slice(0, 5).map((e) => (
              <div key={e.id} className="px-3 py-2">
                <p className="text-xs font-medium text-white truncate">{e.title}</p>
                <p className="text-[10px] text-red-400 mt-0.5">
                  {new Date(e.next_follow_up_at!).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  {e.allocated_user_id && ` · ${members.find((m) => m.user_id === e.allocated_user_id)?.full_name ?? ""}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Upcoming follow-ups */}
      <div className="rounded-xl border border-[#2a3045] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#2a3045] px-3 py-2">
          <Clock className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-xs font-semibold text-white">Upcoming (7 days)</span>
        </div>
        <div className="divide-y divide-[#2a3045]">
          {upcomingEnq.map((e) => {
            const d = new Date(e.next_follow_up_at!);
            const isToday = d.toDateString() === now.toDateString();
            return (
              <div key={e.id} className="flex items-center gap-2 px-3 py-2">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold ${isToday ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/10 text-blue-400"}`}>
                  {d.getDate()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-200">{e.title}</p>
                  <p className="text-[10px] text-slate-500">{e.status.replace("_", " ")}</p>
                </div>
              </div>
            );
          })}
          {upcomingEnq.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-slate-500">No upcoming follow-ups</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Product tasks sidebar ─────────────────────────────────────────────────────
function ProductTasksSidebar({ productTasks }: { productTasks: ProductTask[] }) {
  const total = productTasks.length;
  const withDue = productTasks.filter((t) => t.due_date).length;
  const overdue = productTasks.filter((t) => t.due_date && t.due_date < new Date().toISOString().slice(0, 10)).length;
  const noDue = productTasks.filter((t) => !t.due_date).length;

  // Group by product
  const byProduct = productTasks.reduce<Record<string, { name: string; count: number }>>((acc, t) => {
    const key = t.product_id ?? "__none__";
    const name = (t.product as { project_name?: string } | null)?.project_name ?? "No Product";
    if (!acc[key]) acc[key] = { name, count: 0 };
    acc[key].count++;
    return acc;
  }, {});
  const productRows = Object.values(byProduct).sort((a, b) => b.count - a.count);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "Total",    count: total,   color: "text-teal-400" },
          { label: "With Due", count: withDue, color: "text-blue-400" },
          { label: "Overdue",  count: overdue, color: "text-red-400" },
          { label: "No Date",  count: noDue,   color: "text-slate-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-[#0f1117] px-2 py-2 text-center">
            <p className={`text-sm font-bold ${s.color}`}>{s.count}</p>
            <p className="text-[9px] text-slate-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      {productRows.length > 0 && (
        <div className="rounded-xl border border-[#2a3045] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[#2a3045] px-3 py-2">
            <Package className="h-3.5 w-3.5 text-teal-400" />
            <span className="text-xs font-semibold text-white">By Product</span>
          </div>
          <div className="divide-y divide-[#2a3045]">
            {productRows.map((p) => (
              <div key={p.name} className="flex items-center justify-between px-3 py-2">
                <p className="text-xs text-slate-300 truncate flex-1">{p.name}</p>
                <span className="shrink-0 ml-2 text-[10px] font-bold text-teal-400">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { accountId, user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    try { return (localStorage.getItem("ov-active-tab") as TabKey) ?? "my-work"; } catch { return "my-work"; }
  });
  function switchTab(t: TabKey) {
    setActiveTab(t);
    try { localStorage.setItem("ov-active-tab", t); } catch {}
  }

  // Global people filter — shown on ALL tabs; each tab can override with its own sub-filter
  const [globalUserId, setGlobalUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<AccountMember[]>([]);

  // Per-tab sub-filters (override global when set)
  const [enqSubUser, setEnqSubUser] = useState<string | null>(null);
  const [prodSubUser, setProdSubUser] = useState<string | null>(null);

  // Effective user per tab: sub ?? global ?? null (null = show all)
  const enqEffectiveUser = enqSubUser ?? globalUserId;
  const prodEffectiveUser = prodSubUser ?? globalUserId;

  // My Work — always uses globalUserId, defaulting to current user
  const myWorkUserId = globalUserId ?? user?.id ?? null;

  const [myWorkData, setMyWorkData] = useState<{
    my_work: { overdue: MyWorkTask[]; due_today: MyWorkTask[]; upcoming: MyWorkTask[]; waiting: MyWorkTask[] };
    followups: MyWorkFollowUp[];
  } | null>(null);
  const [loadingMyWork, setLoadingMyWork] = useState(false);
  const [allProductTasks, setAllProductTasks] = useState<ProductTask[]>([]);

  // Projects
  const [projects, setProjects] = useState<ProjectWithTaskCount[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Enquiry tasks
  const [enquiries, setEnquiries] = useState<ClientLead[]>([]);
  const [enquirySearch, setEnquirySearch] = useState("");
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState<string>("all");
  const [loadingEnquiries, setLoadingEnquiries] = useState(false);
  const [enqSortField, setEnqSortField] = useState<EnqSortField>("next_follow_up_at");
  const [enqSortDir, setEnqSortDir] = useState<SortDir>("asc");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Product tasks (overview tab)
  const [productTasks, setProductTasks] = useState<ProductTask[]>([]);
  const [loadingProductTasks, setLoadingProductTasks] = useState(false);
  const [ptSearch, setPtSearch] = useState("");
  const [ptSortField, setPtSortField] = useState<PtSortField>("due_date");
  const [ptSortDir, setPtSortDir] = useState<SortDir>("asc");

  // Supporting data for modals
  const [ptProducts, setPtProducts] = useState<PtProduct[]>([]);
  const [ptStages, setPtStages] = useState<PtStage[]>([]);

  // Modals
  const [ptModal, setPtModal] = useState<PtModalState | null>(null);
  const [ptModalSaving, setPtModalSaving] = useState(false);
  const [enqModal, setEnqModal] = useState<EnqModalState | null>(null);
  const [enqModalSaving, setEnqModalSaving] = useState(false);

  // Hidden rows (eye icon)
  const [hiddenRowsEnq, setHiddenRowsEnq] = useState<Set<string>>(new Set());
  const [hiddenRowsPt, setHiddenRowsPt] = useState<Set<string>>(new Set());

  useEffect(() => {
    const [ef, ed] = loadSort("enq", "next_follow_up_at");
    setEnqSortField(ef as EnqSortField); setEnqSortDir(ed);
    const [pf, pd] = loadSort("pt", "due_date");
    setPtSortField(pf as PtSortField); setPtSortDir(pd);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    fetch("/api/account/members").then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.members) setMembers(d.members); });
  }, [accountId]);

  const loadProjects = useCallback(async () => {
    if (!accountId) return;
    setLoadingProjects(true);
    try {
      const supabase = createClient();
      const { data: projectsData } = await supabase.from("projects").select("*").eq("account_id", accountId).order("name");
      if (!projectsData) return;
      const { data: taskCounts } = await supabase.from("project_tasks").select("project_id").eq("account_id", accountId);
      const countMap: Record<string, number> = {};
      for (const t of taskCounts ?? []) countMap[t.project_id] = (countMap[t.project_id] ?? 0) + 1;
      setProjects(projectsData.map((p) => ({ ...p, task_count: countMap[p.id] ?? 0 })));
    } finally { setLoadingProjects(false); }
  }, [accountId]);

  const loadMyWork = useCallback(async () => {
    if (!myWorkUserId) return;
    setLoadingMyWork(true);
    try {
      const [dashRes, ptRes] = await Promise.all([
        fetch(`/api/my-dashboard?user_id=${myWorkUserId}`),
        fetch("/api/product-tasks"),
      ]);
      if (dashRes.ok) setMyWorkData(await dashRes.json());
      if (ptRes.ok) { const d = await ptRes.json(); setAllProductTasks(d.tasks ?? []); }
    } finally { setLoadingMyWork(false); }
  }, [myWorkUserId]);

  const loadEnquiries = useCallback(async () => {
    if (!accountId) return;
    setLoadingEnquiries(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("client_leads")
        .select("id, title, status, priority, next_follow_up_at, created_at, phone, allocated_user_id, allocated_user_ids")
        .eq("account_id", accountId).order("created_at", { ascending: false });
      setEnquiries((data as ClientLead[]) ?? []);
    } finally { setLoadingEnquiries(false); }
  }, [accountId]);

  const loadProductTasks = useCallback(async () => {
    setLoadingProductTasks(true);
    try {
      const res = await fetch("/api/product-tasks");
      if (res.ok) { const d = await res.json(); setProductTasks(d.tasks ?? []); }
    } finally { setLoadingProductTasks(false); }
  }, []);

  const loadPtSupporting = useCallback(async () => {
    if (!accountId) return;
    const [prRes] = await Promise.all([
      fetch("/api/products"),
    ]);
    if (prRes.ok) {
      const d = await prRes.json();
      setPtProducts((d.products ?? []).map((p: { id: string; project_name: string }) => ({ id: p.id, project_name: p.project_name })));
    }
    const supabase = createClient();
    const { data: stagesData } = await supabase.from("pipeline_stages").select("id, name").eq("account_id", accountId);
    if (stagesData) setPtStages(stagesData as PtStage[]);
  }, [accountId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => {
    if (activeTab === "my-work") loadMyWork();
    if (activeTab === "enquiry-tasks") loadEnquiries();
    if (activeTab === "product-tasks") { loadProductTasks(); loadPtSupporting(); }
  }, [activeTab, loadMyWork, loadEnquiries, loadProductTasks, loadPtSupporting]);
  useEffect(() => { if (activeTab === "my-work") loadMyWork(); }, [myWorkUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === "enquiry-tasks") loadEnquiries(); }, [enqEffectiveUser]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === "product-tasks") loadProductTasks(); }, [prodEffectiveUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = new Date().toISOString().slice(0, 10);

  // ── My Work derived ────────────────────────────────────────────────────────
  function taskMatchesUser(task: MyWorkTask, userId: string | null): boolean {
    if (!userId) return true;
    return task.assignee_user_id === userId || (task.assignee_user_ids ?? []).includes(userId);
  }
  function taskIsVisible(task: MyWorkTask): boolean {
    return !task.show_date || task.show_date <= todayStr;
  }
  const overdueProjectTasks = (myWorkData?.my_work.overdue ?? []).filter((t) => taskMatchesUser(t, myWorkUserId) && taskIsVisible(t));
  const dueTodayProjectTasks = (myWorkData?.my_work.due_today ?? []).filter((t) => taskMatchesUser(t, myWorkUserId) && taskIsVisible(t));
  const upcomingTaskList = (myWorkData?.my_work.upcoming ?? []).filter((t) => taskMatchesUser(t, myWorkUserId) && taskIsVisible(t));
  const waitingTaskList = (myWorkData?.my_work.waiting ?? []).filter((t) => taskMatchesUser(t, myWorkUserId) && taskIsVisible(t));
  const allProjectTasks = [...overdueProjectTasks, ...dueTodayProjectTasks, ...upcomingTaskList, ...waitingTaskList];
  const allFollowups = myWorkData?.followups ?? [];
  const myProductTasks = allProductTasks.filter((t) => {
    if (!myWorkUserId) return true;
    return t.assignee_user_id === myWorkUserId || (t.assignee_user_ids ?? []).includes(myWorkUserId);
  });

  const overdueFollowups = allFollowups.filter((f) => new Date(f.next_follow_up_at) < new Date());
  const overdueProductTasks = myProductTasks.filter((t) => t.due_date && t.due_date < todayStr);
  const upcomingProjectTasks = [...dueTodayProjectTasks, ...upcomingTaskList].slice(0, 6);
  const upcomingFollowups = allFollowups.filter((f) => {
    const d = new Date(f.next_follow_up_at);
    return d >= new Date() && d <= new Date(Date.now() + 7 * 86400000);
  }).slice(0, 4);

  // ── Enquiry derived ────────────────────────────────────────────────────────
  const filteredEnquiries = enquiries
    .filter((e) => {
      if (enquirySearch && !e.title.toLowerCase().includes(enquirySearch.toLowerCase())) return false;
      if (enquiryStatusFilter !== "all" && e.status !== enquiryStatusFilter) return false;
      if (enqEffectiveUser) {
        const ids = e.allocated_user_ids ?? [];
        if (e.allocated_user_id !== enqEffectiveUser && !ids.includes(enqEffectiveUser)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = enqSortDir === "asc" ? 1 : -1;
      if (enqSortField === "priority") return dir * ((PRIORITY_ORDER[a.priority ?? "medium"] ?? 2) - (PRIORITY_ORDER[b.priority ?? "medium"] ?? 2));
      if (enqSortField === "next_follow_up_at") {
        if (!a.next_follow_up_at && !b.next_follow_up_at) return 0;
        if (!a.next_follow_up_at) return 1; if (!b.next_follow_up_at) return -1;
        return dir * a.next_follow_up_at.localeCompare(b.next_follow_up_at);
      }
      const va = (a as unknown as Record<string, unknown>)[enqSortField] as string ?? "";
      const vb = (b as unknown as Record<string, unknown>)[enqSortField] as string ?? "";
      return dir * va.localeCompare(vb);
    });

  // ── Product tasks derived ──────────────────────────────────────────────────
  const filteredPt = productTasks
    .filter((t) => {
      if (ptSearch && !t.title.toLowerCase().includes(ptSearch.toLowerCase())) return false;
      if (prodEffectiveUser) {
        if (t.assignee_user_id !== prodEffectiveUser && !(t.assignee_user_ids ?? []).includes(prodEffectiveUser)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = ptSortDir === "asc" ? 1 : -1;
      if (ptSortField === "priority") return dir * ((PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
      if (ptSortField === "due_date") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1; if (!b.due_date) return -1;
        return dir * a.due_date.localeCompare(b.due_date);
      }
      return dir * a.title.localeCompare(b.title);
    });

  function toggleEnqSort(field: string) {
    const newDir = enqSortField === field && enqSortDir === "asc" ? "desc" : "asc";
    setEnqSortField(field as EnqSortField); setEnqSortDir(newDir);
    saveSort("enq", field, newDir);
  }
  function togglePtSort(field: string) {
    const newDir = ptSortField === field && ptSortDir === "asc" ? "desc" : "asc";
    setPtSortField(field as PtSortField); setPtSortDir(newDir);
    saveSort("pt", field, newDir);
  }

  async function handleEnqAction(id: string, status: string, extra?: Record<string, unknown>) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/client-leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      if (!res.ok) { toast.error("Could not update"); return; }
      toast.success(`Marked as ${status.replace("_", " ")}`);
      loadEnquiries();
    } finally { setActionLoading(null); }
  }

  const myWorkUserName = myWorkUserId === user?.id
    ? (profile?.full_name ?? "Me")
    : (members.find((m) => m.user_id === myWorkUserId)?.full_name ?? "Team Member");

  // ── Product task CRUD ──────────────────────────────────────────────────────
  async function savePtModal() {
    if (!ptModal || !ptModal.title.trim()) return;
    setPtModalSaving(true);
    try {
      const body = {
        title: ptModal.title.trim(),
        priority: ptModal.priority,
        due_date: ptModal.due_date || null,
        product_id: ptModal.product_id || null,
        stage_id: ptModal.stage_id || null,
      };
      let res: Response;
      if (ptModal.mode === "edit" && ptModal.id) {
        res = await fetch(`/api/product-tasks/${ptModal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/product-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) { toast.error("Could not save task"); return; }
      toast.success(ptModal.mode === "edit" ? "Task updated" : "Task created");
      setPtModal(null);
      loadProductTasks();
    } finally { setPtModalSaving(false); }
  }

  async function deletePt(id: string) {
    if (!confirm("Delete this product task?")) return;
    const res = await fetch(`/api/product-tasks/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete task"); return; }
    toast.success("Task deleted");
    setProductTasks((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Enquiry CRUD ───────────────────────────────────────────────────────────
  async function saveEnqModal() {
    if (!enqModal || !enqModal.title.trim() || !accountId) return;
    setEnqModalSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("client_leads").insert({
        account_id: accountId,
        title: enqModal.title.trim(),
        phone: enqModal.phone || null,
        status: "new",
        created_by: user?.id,
      });
      if (error) { toast.error("Could not create enquiry"); return; }
      toast.success("Enquiry created");
      setEnqModal(null);
      loadEnquiries();
    } finally { setEnqModalSaving(false); }
  }

  async function deleteEnq(id: string) {
    if (!confirm("Delete this enquiry?")) return;
    const res = await fetch(`/api/client-leads/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete enquiry"); return; }
    toast.success("Enquiry deleted");
    setEnquiries((prev) => prev.filter((e) => e.id !== id));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0f1117]">
      {/* Product Task Modal */}
      {ptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">{ptModal.mode === "edit" ? "Edit Task" : "New Product Task"}</h2>
              <button type="button" onClick={() => setPtModal(null)} className="text-slate-500 hover:text-slate-300"><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Title *</label>
                <input autoFocus value={ptModal.title} onChange={(e) => setPtModal({ ...ptModal, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") savePtModal(); }}
                  className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
                  placeholder="Task title" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Priority</label>
                  <select value={ptModal.priority} onChange={(e) => setPtModal({ ...ptModal, priority: e.target.value })}
                    className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Due Date</label>
                  <input type="date" value={ptModal.due_date} onChange={(e) => setPtModal({ ...ptModal, due_date: e.target.value })}
                    className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Product</label>
                <select value={ptModal.product_id} onChange={(e) => setPtModal({ ...ptModal, product_id: e.target.value })}
                  className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none">
                  <option value="">No product</option>
                  {ptProducts.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
              </div>
              {ptStages.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Stage</label>
                  <select value={ptModal.stage_id} onChange={(e) => setPtModal({ ...ptModal, stage_id: e.target.value })}
                    className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none">
                    <option value="">No stage</option>
                    {ptStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setPtModal(null)} className="rounded-lg border border-[#2a3045] px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button type="button" onClick={savePtModal} disabled={ptModalSaving || !ptModal.title.trim()}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 transition-colors">
                {ptModalSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {ptModal.mode === "edit" ? "Save Changes" : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enquiry Create Modal */}
      {enqModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">New Enquiry</h2>
              <button type="button" onClick={() => setEnqModal(null)} className="text-slate-500 hover:text-slate-300"><XIcon className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Title / Client Name *</label>
                <input autoFocus value={enqModal.title} onChange={(e) => setEnqModal({ ...enqModal, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEnqModal(); }}
                  className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. John Doe – Website" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Phone</label>
                <input value={enqModal.phone} onChange={(e) => setEnqModal({ ...enqModal, phone: e.target.value })}
                  className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                  placeholder="+91 99999 00000" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setEnqModal(null)} className="rounded-lg border border-[#2a3045] px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button type="button" onClick={saveEnqModal} disabled={enqModalSaving || !enqModal.title.trim()}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
                {enqModalSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create Enquiry
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* Header + global filter */}
        <div className="shrink-0 px-6 pt-5 pb-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="mt-0.5 text-sm text-slate-400">Every task worth tracking — all in one place.</p>
          </div>
          {/* Global people picker — always visible on all tabs */}
          <PeoplePicker
            members={members}
            value={globalUserId}
            onChange={setGlobalUserId}
            currentUserId={user?.id}
            currentUserName={profile?.full_name ?? "Me"}
            label="All People"
          />
        </div>

        {/* Tabs */}
        <div className="shrink-0 border-b border-[#2a3045] px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.key} type="button" onClick={() => switchTab(tab.key)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "border border-b-0 border-[#2a3045] bg-[#1a1f2e] text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}>
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto p-6">

          {/* My Work */}
          {activeTab === "my-work" && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Showing work for:</span>
                <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-sm font-medium text-blue-300">{myWorkUserName}</span>
                {globalUserId && (
                  <button type="button" onClick={() => setGlobalUserId(null)}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Reset</button>
                )}
              </div>

              {loadingMyWork ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                </div>
              ) : (
                <>
                  {allProjectTasks.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Project Tasks</h3>
                      <div className="overflow-hidden rounded-xl border border-[#2a3045]">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500 bg-[#1a1f2e]">
                              <th className="px-4 py-2.5 font-medium">Task</th>
                              <th className="px-4 py-2.5 font-medium">Project</th>
                              <th className="px-4 py-2.5 font-medium">Stage</th>
                              <th className="px-4 py-2.5 font-medium">Priority</th>
                              <th className="px-4 py-2.5 font-medium">Due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allProjectTasks.map((task) => {
                              const isOverdue = overdueProjectTasks.some((t) => t.id === task.id);
                              const isToday = myWorkData?.my_work.due_today.some((t) => t.id === task.id);
                              return (
                                <tr key={task.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                                  <td className="px-4 py-3 font-medium text-white">
                                    <div className="flex items-center gap-2">
                                      <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOverdue ? "bg-red-400" : isToday ? "bg-amber-400" : "bg-blue-400"}`} />
                                      {task.title}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-400">{task.project?.name ?? "—"}</td>
                                  <td className="px-4 py-3 text-xs text-slate-400">{task.stage?.name ?? "—"}</td>
                                  <td className="px-4 py-3">
                                    {task.priority ? (
                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[task.priority] ?? ""}`}>{task.priority}</span>
                                    ) : <span className="text-slate-600">—</span>}
                                  </td>
                                  <td className={`px-4 py-3 text-xs font-medium ${isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-slate-400"}`}>
                                    {task.due_date ? (isToday ? "Today" : new Date(task.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {allFollowups.length > 0 && (
                    <FollowupsSection followups={allFollowups} />
                  )}

                  {myProductTasks.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Product Tasks</h3>
                      <div className="overflow-hidden rounded-xl border border-[#2a3045]">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500 bg-[#1a1f2e]">
                              <th className="px-4 py-2.5 font-medium">Task</th>
                              <th className="px-4 py-2.5 font-medium">Product</th>
                              <th className="px-4 py-2.5 font-medium">Priority</th>
                              <th className="px-4 py-2.5 font-medium">Due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {myProductTasks.map((t) => {
                              const isOverdueP = t.due_date && t.due_date < todayStr;
                              const isTodayP = t.due_date === todayStr;
                              const prodName = (t.product as { project_name?: string; name?: string } | null)?.project_name ?? (t.product as { project_name?: string; name?: string } | null)?.name ?? "—";
                              return (
                                <tr key={t.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                                  <td className="px-4 py-3 font-medium text-white">{t.title}</td>
                                  <td className="px-4 py-3 text-xs text-slate-400">{prodName}</td>
                                  <td className="px-4 py-3">
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[t.priority] ?? ""}`}>{t.priority}</span>
                                  </td>
                                  <td className={`px-4 py-3 text-xs font-medium ${isOverdueP ? "text-red-400" : isTodayP ? "text-amber-400" : "text-slate-400"}`}>
                                    {t.due_date ? (isTodayP ? "Today" : new Date(t.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {allProjectTasks.length === 0 && allFollowups.length === 0 && myProductTasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 gap-3 text-center">
                      <CheckCircle2 className="h-10 w-10 text-green-500/40" />
                      <p className="text-sm text-slate-500">All clear! No tasks assigned to {myWorkUserName}.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "project-tasks" && <UnifiedTasksView />}

          {/* Enquiry Tasks */}
          {activeTab === "enquiry-tasks" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input type="text" placeholder="Search enquiries..." value={enquirySearch}
                  onChange={(e) => setEnquirySearch(e.target.value)}
                  className="flex-1 min-w-[160px] max-w-xs rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
                <select value={enquiryStatusFilter} onChange={(e) => setEnquiryStatusFilter(e.target.value)}
                  className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none">
                  <option value="all">All Status</option>
                  <option value="in_discussion">In Discussion</option>
                  <option value="hold">Hold</option>
                  <option value="confirmed">Converted</option>
                  <option value="rejected">Rejected</option>
                </select>
                {/* Sub-filter: overrides global */}
                <PeoplePicker
                  members={members}
                  value={enqSubUser}
                  onChange={setEnqSubUser}
                  currentUserId={user?.id}
                  currentUserName={profile?.full_name ?? "Me"}
                  label={globalUserId && !enqSubUser ? "↑ Global filter" : "All People"}
                />
                <button type="button" onClick={() => setEnqModal({ title: "", phone: "" })}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> New Enquiry
                </button>
                <Link href="/client-leads"
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600/20 px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-600/30 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Open Client Leads
                </Link>
              </div>
              {loadingEnquiries ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
              ) : filteredEnquiries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-16 gap-3 text-center">
                  <ClipboardList className="h-10 w-10 text-slate-600" />
                  <p className="text-sm text-slate-500">No enquiries match this filter.</p>
                  <Link href="/client-leads" className="text-xs text-blue-400 hover:underline">Go to Client Leads →</Link>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#2a3045]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500 bg-[#1a1f2e]">
                        <th className="px-2 py-2.5 font-medium w-8" />
                        <SortTh label="Title" field="title" sortField={enqSortField} sortDir={enqSortDir} onSort={toggleEnqSort} />
                        <SortTh label="Status" field="status" sortField={enqSortField} sortDir={enqSortDir} onSort={toggleEnqSort} />
                        <SortTh label="Priority" field="priority" sortField={enqSortField} sortDir={enqSortDir} onSort={toggleEnqSort} />
                        <th className="px-4 py-2.5 font-medium">Assignee</th>
                        <SortTh label="Follow-up" field="next_follow_up_at" sortField={enqSortField} sortDir={enqSortDir} onSort={toggleEnqSort} />
                        <th className="px-4 py-2.5 font-medium">Actions</th>
                        <th className="px-4 py-2.5 font-medium w-0" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEnquiries.filter((e) => !hiddenRowsEnq.has(e.id)).map((e) => {
                        const isLoading = actionLoading === e.id;
                        const assignee = members.find((m) => m.user_id === e.allocated_user_id);
                        return (
                          <tr key={e.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                            <td className="px-2 py-3">
                              <button type="button" onClick={() => setHiddenRowsEnq((prev) => { const n = new Set(prev); n.add(e.id); return n; })}
                                className="text-slate-600 hover:text-slate-300 transition-colors" title="Hide row">
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </td>
                            <td className="px-4 py-3 font-medium text-white">
                              <Link href={`/client-leads/${e.id}`} className="hover:text-blue-400 transition-colors">{e.title}</Link>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${ENQUIRY_STATUS_STYLE[e.status] ?? "bg-slate-500/20 text-slate-400"}`}>
                                {e.status.replace("_", " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {e.priority ? (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[e.priority] ?? ""}`}>{e.priority}</span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400">
                              {assignee ? (
                                <span className="flex items-center gap-1">
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[9px] font-bold text-blue-400">
                                    {(assignee.full_name ?? "?").charAt(0).toUpperCase()}
                                  </span>
                                  {assignee.full_name}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                              {e.next_follow_up_at
                                ? new Date(e.next_follow_up_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 flex-wrap">
                                <button type="button" disabled={isLoading} onClick={() => handleEnqAction(e.id, "hold")}
                                  title="Hold" className="flex items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors">
                                  <Clock className="h-3 w-3" />
                                </button>
                                <Link href={`/client-leads/${e.id}`} title="Move to Converted"
                                  className="flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400 hover:bg-green-500/20 transition-colors">
                                  <UserCheck className="h-3 w-3" />
                                </Link>
                                <button type="button" disabled={isLoading} onClick={() => handleEnqAction(e.id, "rejected")}
                                  title="Reject" className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
                                  <XCircle className="h-3 w-3" />
                                </button>
                                <button type="button" disabled={isLoading} onClick={() => handleEnqAction(e.id, "future_client")}
                                  title="Move to Future Task" className="flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors">
                                  <CalendarClock className="h-3 w-3" />
                                </button>
                                {e.phone && (
                                  <a href={`https://wa.me/${e.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                                    title="WhatsApp" className="flex items-center gap-1 rounded border border-green-600/30 bg-green-600/10 px-1.5 py-0.5 text-[10px] font-medium text-green-500 hover:bg-green-600/20 transition-colors">
                                    <MessageCircle className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <Link href={`/client-leads/${e.id}`} className="text-slate-500 hover:text-blue-400 transition-colors" title="Open">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                                <button type="button" onClick={() => deleteEnq(e.id)} className="text-slate-600 hover:text-red-400 transition-colors" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {hiddenRowsEnq.size > 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-2">
                            <button type="button" onClick={() => setHiddenRowsEnq(new Set())}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                              <EyeOff className="h-3 w-3" /> {hiddenRowsEnq.size} hidden — click to show all
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Product Tasks */}
          {activeTab === "product-tasks" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <input type="text" placeholder="Search product tasks..." value={ptSearch}
                  onChange={(e) => setPtSearch(e.target.value)}
                  className="flex-1 min-w-[180px] max-w-xs rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
                {/* Sub-filter: overrides global */}
                <PeoplePicker
                  members={members}
                  value={prodSubUser}
                  onChange={setProdSubUser}
                  currentUserId={user?.id}
                  currentUserName={profile?.full_name ?? "Me"}
                  label={globalUserId && !prodSubUser ? "↑ Global filter" : "All People"}
                />
                <button type="button" onClick={() => setPtModal({ mode: "create", title: "", priority: "medium", due_date: "", product_id: "", stage_id: "" })}
                  className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> New Task
                </button>
                <Link href="/product-tasks"
                  className="ml-auto flex items-center gap-1.5 rounded-lg bg-teal-600/20 px-3 py-1.5 text-sm font-medium text-teal-400 hover:bg-teal-600/30 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Manage Product Tasks
                </Link>
              </div>
              {loadingProductTasks ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
              ) : filteredPt.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-16 gap-3 text-center">
                  <Package className="h-10 w-10 text-slate-600" />
                  <p className="text-sm text-slate-500">{ptSearch ? "No tasks match." : "No product tasks yet."}</p>
                  <Link href="/product-tasks" className="text-xs text-teal-400 hover:underline">Go to Product Tasks →</Link>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#2a3045]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500 bg-[#1a1f2e]">
                        <th className="px-2 py-2.5 font-medium w-8" />
                        <SortTh label="Title" field="title" sortField={ptSortField} sortDir={ptSortDir} onSort={togglePtSort} />
                        <SortTh label="Priority" field="priority" sortField={ptSortField} sortDir={ptSortDir} onSort={togglePtSort} />
                        <SortTh label="Due Date" field="due_date" sortField={ptSortField} sortDir={ptSortDir} onSort={togglePtSort} />
                        <th className="px-4 py-2.5 font-medium">Product</th>
                        <th className="px-4 py-2.5 font-medium w-0" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPt.filter((t) => !hiddenRowsPt.has(t.id)).map((t) => {
                        const isOverdue = t.due_date && t.due_date < todayStr;
                        const isToday = t.due_date === todayStr;
                        const ptName = (t.product as { project_name?: string; name?: string } | null)?.project_name
                          ?? (t.product as { project_name?: string; name?: string } | null)?.name
                          ?? "—";
                        return (
                          <tr key={t.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                            <td className="px-2 py-3">
                              <button type="button" onClick={() => setHiddenRowsPt((prev) => { const n = new Set(prev); n.add(t.id); return n; })}
                                className="text-slate-600 hover:text-slate-300 transition-colors" title="Hide row">
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </td>
                            <td className="px-4 py-3 font-medium text-white">{t.title}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[t.priority] ?? ""}`}>{t.priority}</span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {t.due_date ? (
                                <span className={isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-slate-400"}>
                                  {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{ptName}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <button type="button" title="Edit"
                                  onClick={() => setPtModal({ mode: "edit", id: t.id, title: t.title, priority: t.priority, due_date: t.due_date ?? "", product_id: t.product_id ?? "", stage_id: t.stage_id ?? "" })}
                                  className="text-slate-500 hover:text-teal-400 transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" title="Delete" onClick={() => deletePt(t.id)}
                                  className="text-slate-600 hover:text-red-400 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {hiddenRowsPt.size > 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-2">
                            <button type="button" onClick={() => setHiddenRowsPt(new Set())}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                              <EyeOff className="h-3 w-3" /> {hiddenRowsPt.size} hidden — click to show all
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Task Automation */}
          {activeTab === "task-automation" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">Manage automated task rules for your projects</p>
                <Link href="/projects/automations"
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600/20 px-3 py-1.5 text-sm font-medium text-purple-400 hover:bg-purple-600/30 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Open Automations
                </Link>
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10">
                  <Zap className="h-8 w-8 text-purple-400" />
                </div>
                <div>
                  <p className="text-base font-medium text-white mb-1">Task Automation</p>
                  <p className="text-sm text-slate-500 max-w-sm">
                    Set up automation rules to automatically assign, move, or notify when tasks change state.
                  </p>
                </div>
                <Link href="/projects/automations"
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-500 transition-colors">
                  <Zap className="h-4 w-4" /> Manage Automations
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar — content varies per tab */}
      <div className="w-72 shrink-0 border-l border-[#2a3045] bg-[#1a1f2e] flex flex-col overflow-hidden">
        {activeTab === "project-tasks" ? (
          <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Total", count: allProductTasks.length, color: "text-teal-400" },
                { label: "Overdue", count: allProductTasks.filter((t) => t.due_date && t.due_date < todayStr).length, color: "text-red-400" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-[#0f1117] px-2 py-2 text-center">
                  <p className={`text-sm font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-[9px] text-slate-600 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-[#2a3045] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[#2a3045] px-3 py-2">
                <Package className="h-3.5 w-3.5 text-teal-400" />
                <span className="text-xs font-semibold text-white">Product Task Breakdown</span>
              </div>
              <div className="divide-y divide-[#2a3045]">
                {(() => {
                  const byProduct = allProductTasks.reduce<Record<string, { name: string; count: number }>>((acc, t) => {
                    const key = t.product_id ?? "__none__";
                    const name = (t.product as { project_name?: string } | null)?.project_name ?? "No Product";
                    if (!acc[key]) acc[key] = { name, count: 0 };
                    acc[key].count++;
                    return acc;
                  }, {});
                  const rows = Object.values(byProduct).sort((a, b) => b.count - a.count);
                  if (rows.length === 0) return <p className="px-3 py-4 text-center text-xs text-slate-500">No product tasks</p>;
                  return rows.map((p) => (
                    <div key={p.name} className="flex items-center justify-between px-3 py-2">
                      <p className="text-xs text-slate-300 truncate flex-1">{p.name}</p>
                      <span className="shrink-0 ml-2 text-[10px] font-bold text-teal-400">{p.count}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        ) : activeTab === "my-work" ? (
          <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "Tasks",     count: allProjectTasks.length,  color: "text-blue-400" },
                { label: "Follow-ups", count: allFollowups.length,    color: "text-purple-400" },
                { label: "Products",  count: myProductTasks.length,   color: "text-teal-400" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-[#0f1117] px-2 py-2 text-center">
                  <p className={`text-sm font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-[9px] text-slate-600 leading-tight mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Overdue */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 overflow-hidden">
              <div className="flex items-center gap-2 border-b border-red-500/20 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-red-300">Overdue</h2>
                <span className="ml-auto rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                  {overdueProjectTasks.length + overdueFollowups.length + overdueProductTasks.length}
                </span>
              </div>
              <div className="divide-y divide-red-500/10">
                {overdueProjectTasks.map((t) => (
                  <div key={`op-${t.id}`} className="px-3 py-2">
                    <p className="text-xs font-medium text-white truncate">{t.title}</p>
                    <p className="text-[10px] text-red-400 mt-0.5">Task · {t.due_date ? new Date(t.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</p>
                  </div>
                ))}
                {overdueFollowups.map((f) => (
                  <div key={`of-${f.id}`} className="px-3 py-2">
                    <p className="text-xs font-medium text-white truncate">{f.title}</p>
                    <p className="text-[10px] text-red-400 mt-0.5">Follow-up · {new Date(f.next_follow_up_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</p>
                  </div>
                ))}
                {overdueProductTasks.map((t) => (
                  <div key={`opt-${t.id}`} className="px-3 py-2">
                    <p className="text-xs font-medium text-white truncate">{t.title}</p>
                    <p className="text-[10px] text-red-400 mt-0.5">Product · {t.due_date ? new Date(t.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</p>
                  </div>
                ))}
                {overdueProjectTasks.length === 0 && overdueFollowups.length === 0 && overdueProductTasks.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-slate-500">Nothing overdue</p>
                )}
              </div>
            </div>

            {/* Upcoming Deadlines */}
            <div className="rounded-xl border border-[#2a3045] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[#2a3045] px-3 py-2.5">
                <Clock className="h-4 w-4 text-orange-400" />
                <h2 className="text-sm font-semibold text-white">Upcoming Deadlines</h2>
              </div>
              <div className="divide-y divide-[#2a3045]">
                {upcomingProjectTasks.map((t) => {
                  const isToday = t.due_date === todayStr;
                  return (
                    <div key={`up-${t.id}`} className="flex items-center gap-2.5 px-3 py-2">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold ${isToday ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/10 text-blue-400"}`}>
                        {t.due_date ? new Date(t.due_date + "T00:00:00").getDate() : "—"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-200">{t.title}</p>
                        <p className="text-[10px] text-slate-500">{t.project?.name ?? "Task"}</p>
                      </div>
                    </div>
                  );
                })}
                {upcomingFollowups.map((f) => {
                  const fDate = new Date(f.next_follow_up_at);
                  const isTodayF = fDate.toDateString() === new Date().toDateString();
                  return (
                    <div key={`uf-${f.id}`} className="flex items-center gap-2.5 px-3 py-2">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold ${isTodayF ? "bg-amber-500/20 text-amber-300" : "bg-purple-500/10 text-purple-400"}`}>
                        {fDate.getDate()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-200">{f.title}</p>
                        <p className="text-[10px] text-slate-500">Follow-up</p>
                      </div>
                    </div>
                  );
                })}
                {upcomingProjectTasks.length === 0 && upcomingFollowups.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-slate-500">No upcoming deadlines</p>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "enquiry-tasks" ? (
          <EnquirySidebar enquiries={enquiries} members={members} todayStr={todayStr} />
        ) : activeTab === "product-tasks" ? (
          <ProductTasksSidebar productTasks={productTasks} />
        ) : (
          <ProjectsSidebar
            projects={projects}
            loading={loadingProjects}
            search={projectSearch}
            setSearch={setProjectSearch}
          />
        )}
      </div>
    </div>
  );
}
