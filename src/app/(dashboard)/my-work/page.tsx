"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown, ChevronUp, ChevronsUpDown, Loader2,
  ClipboardList, Package, UserPlus, Eye, EyeOff, Share2, Calendar, Clock, RotateCcw, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface ProjectTask {
  id: string; title: string;
  target_date?: string | null;
  priority?: string | null;
  show_date: string | null;
  stage?: { name: string } | null;
  project?: { id: string; name: string } | null;
  assignee_user_id: string | null; assignee_user_ids: string[];
}
interface ProductTask {
  id: string; title: string;
  due_date?: string | null;
  priority?: string | null;
  show_date: string | null;
  stage?: { name: string } | null;
  product?: { project_name?: string } | null;
  product_id: string | null;
  assignee_user_id: string | null; assignee_user_ids: string[];
}
interface ClientLead {
  id: string; title: string;
  status: string; next_follow_up_at: string | null;
  allocated_user_id: string | null; allocated_user_ids: string[];
}

const STATUS_BADGE: Record<string, string> = {
  in_discussion: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  hold: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
  confirmed: "text-green-400 bg-green-500/20 border-green-500/30",
  rejected: "text-red-400 bg-red-500/20 border-red-500/30",
};
const STATUS_DISPLAY: Record<string, string> = {
  in_discussion: "Discussion", hold: "Hold", confirmed: "Converted", rejected: "Rejected",
};

type SortDir = "asc" | "desc";
type ViewTab = "current" | "scheduled";

const LS_SORT_PT = "mw-sort-pt";
const LS_SORT_PD = "mw-sort-pd";
const LS_SCHED_CL = "mw-sched-cl"; // {id: date} for client enquiry (no DB show_date)

function loadSchedCl(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_SCHED_CL) ?? "{}") as Record<string, string>; } catch { return {}; }
}
function saveSchedCl(d: Record<string, string>) {
  try { localStorage.setItem(LS_SCHED_CL, JSON.stringify(d)); } catch {}
}

function SortBtn({ label, active, dir, onClick }: {
  label: string; active: boolean; dir: SortDir; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap">
      {label}
      {active
        ? dir === "asc" ? <ChevronUp className="h-2.5 w-2.5 text-blue-400" /> : <ChevronDown className="h-2.5 w-2.5 text-blue-400" />
        : <ChevronsUpDown className="h-2.5 w-2.5 text-slate-700" />}
    </button>
  );
}

function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Schedule popup menu (2 options: tomorrow / pick date)
function ScheduleMenu({
  onTomorrow,
  onDate,
  onClose,
}: { onTomorrow: () => void; onDate: (d: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref}
      className="absolute right-0 top-6 z-50 w-48 rounded-lg border border-[#2a3045] bg-[#0f1117] shadow-xl py-1"
      onClick={e => e.stopPropagation()}>
      <button type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-[#1a1f2e] transition-colors"
        onClick={() => { onTomorrow(); onClose(); }}>
        <Clock className="h-3.5 w-3.5 text-slate-500" />
        Hide until tomorrow
      </button>
      <label className="flex flex-col px-3 py-2 text-xs text-slate-300 hover:bg-[#1a1f2e] cursor-pointer gap-1">
        <span className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-slate-500" />
          Hide until date
        </span>
        <input type="date"
          className="mt-0.5 bg-[#1a1f2e] border border-[#2a3045] rounded px-1.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          min={tomorrowStr()}
          onChange={(e) => { if (e.target.value) { onDate(e.target.value); onClose(); } }} />
      </label>
    </div>
  );
}

export default function MyWorkPage() {
  const { user, accountId } = useAuth();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [projectTasks, setProjectTasks] = useState<ProjectTask[] | null>(null);
  const [productTasks, setProductTasks] = useState<ProductTask[] | null>(null);
  const [leads, setLeads] = useState<ClientLead[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Scheduled client enquiries (localStorage, since client_leads has no show_date)
  const [schedCl, setSchedCl] = useState<Record<string, string>>({});

  // Active hide-menu row id
  const [hideMenuId, setHideMenuId] = useState<string | null>(null);

  // Tab: current vs scheduled
  const [viewTab, setViewTab] = useState<ViewTab>("current");

  // Per-column overdue filter
  const [clOverdue, setClOverdue] = useState(false);

  // Per-column sort — persisted to localStorage
  const [ptSort, setPtSort] = useState<"project" | "stage">(() => {
    try { const v = localStorage.getItem(LS_SORT_PT); return (v === "stage" ? "stage" : "project"); } catch { return "project"; }
  });
  const [ptDir, setPtDir] = useState<SortDir>(() => {
    try { const v = localStorage.getItem(LS_SORT_PT + "-dir"); return (v === "desc" ? "desc" : "asc"); } catch { return "asc"; }
  });
  const [pdSort, setPdSort] = useState<"title" | "stage">(() => {
    try { const v = localStorage.getItem(LS_SORT_PD); return (v === "stage" ? "stage" : "title"); } catch { return "title"; }
  });
  const [pdDir, setPdDir] = useState<SortDir>(() => {
    try { const v = localStorage.getItem(LS_SORT_PD + "-dir"); return (v === "desc" ? "desc" : "asc"); } catch { return "asc"; }
  });
  const [clSort, setClSort] = useState<"title" | "follow_up" | "status">("follow_up");
  const [clDir, setClDir] = useState<SortDir>("asc");

  function toggle<T extends string>(
    field: T, cur: T, dir: SortDir,
    setF: (f: T) => void, setD: (d: SortDir) => void,
    lsKey?: string,
  ) {
    if (cur === field) {
      const next = dir === "asc" ? "desc" : "asc";
      setD(next);
      if (lsKey) try { localStorage.setItem(lsKey + "-dir", next); } catch {}
    } else {
      setF(field);
      setD("asc");
      if (lsKey) try { localStorage.setItem(lsKey, field); localStorage.setItem(lsKey + "-dir", "asc"); } catch {}
    }
  }

  const load = useCallback(async () => {
    if (!accountId || !user?.id) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const uid = user.id;
      const nowStr = new Date().toISOString().slice(0, 10);
      const assigneeFilter = `assignee_user_id.eq.${uid},assignee_user_ids.cs.{${uid}}`;

      const ptSelect = "id, title, target_date, priority, show_date, stage:pipeline_stages(name), project:projects(id, name), assignee_user_id, assignee_user_ids";
      const pdSelect = "id, title, due_date, priority, show_date, stage:pipeline_stages(name), product:products(project_name), product_id, assignee_user_id, assignee_user_ids";

      const [ptRes, pdRes, clRes] = await Promise.all([
        // fetch ALL assigned project tasks (current + scheduled) so we can split locally
        supabase.from("daily_tasks").select(ptSelect)
          .eq("account_id", accountId).or(assigneeFilter)
          .not("project_id", "is", null),
        supabase.from("product_tasks").select(pdSelect)
          .eq("account_id", accountId).or(assigneeFilter),
        supabase.from("client_leads")
          .select("id, title, status, next_follow_up_at, allocated_user_id, allocated_user_ids")
          .eq("account_id", accountId)
          .or(`allocated_user_id.eq.${uid},allocated_user_ids.cs.{${uid}}`),
      ]);

      const normPt = (ptRes.data ?? [])
        .map((t: Record<string, unknown>) => ({
          ...t,
          stage: Array.isArray(t.stage) ? (t.stage[0] ?? null) : t.stage,
          project: Array.isArray(t.project) ? (t.project[0] ?? null) : t.project,
        })) as ProjectTask[];

      const normPd = (pdRes.data ?? [])
        .map((t: Record<string, unknown>) => ({
          ...t,
          stage: Array.isArray(t.stage) ? (t.stage[0] ?? null) : t.stage,
          product: Array.isArray(t.product) ? (t.product[0] ?? null) : t.product,
        })) as ProductTask[];

      const _ = nowStr; // used to suppress unused var warning
      void _;
      setProjectTasks(normPt);
      setProductTasks(normPd);
      setLeads(clRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [accountId, user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setSchedCl(loadSchedCl());
  }, []);

  // ── Schedule helpers ──────────────────────────────────────────────────────

  async function schedulePt(id: string, date: string) {
    const supabase = createClient();
    await supabase.from("daily_tasks").update({ show_date: date }).eq("id", id);
    setProjectTasks(prev => prev?.map(t => t.id === id ? { ...t, show_date: date } : t) ?? null);
  }

  async function schedulePd(id: string, date: string) {
    const supabase = createClient();
    await supabase.from("product_tasks").update({ show_date: date }).eq("id", id);
    setProductTasks(prev => prev?.map(t => t.id === id ? { ...t, show_date: date } : t) ?? null);
  }

  function scheduleCl(id: string, date: string) {
    const next = { ...schedCl, [id]: date };
    setSchedCl(next);
    saveSchedCl(next);
  }

  async function unschedulePt(id: string) {
    const supabase = createClient();
    await supabase.from("daily_tasks").update({ show_date: null }).eq("id", id);
    setProjectTasks(prev => prev?.map(t => t.id === id ? { ...t, show_date: null } : t) ?? null);
  }

  async function unschedulePd(id: string) {
    const supabase = createClient();
    await supabase.from("product_tasks").update({ show_date: null }).eq("id", id);
    setProductTasks(prev => prev?.map(t => t.id === id ? { ...t, show_date: null } : t) ?? null);
  }

  function unscheduleCl(id: string) {
    const next = { ...schedCl };
    delete next[id];
    setSchedCl(next);
    saveSchedCl(next);
  }

  // ── Derived lists ─────────────────────────────────────────────────────────

  const currentPt = (projectTasks ?? [])
    .filter(t => !t.show_date || t.show_date <= todayStr)
    .sort((a, b) => {
      const d = ptDir === "asc" ? 1 : -1;
      if (ptSort === "stage") return d * (a.stage?.name ?? "").localeCompare(b.stage?.name ?? "");
      return d * (a.project?.name ?? "").localeCompare(b.project?.name ?? "");
    });

  const scheduledPt = (projectTasks ?? [])
    .filter(t => t.show_date && t.show_date > todayStr)
    .sort((a, b) => (a.show_date ?? "").localeCompare(b.show_date ?? ""));

  const currentPd = (productTasks ?? [])
    .filter(t => !t.show_date || t.show_date <= todayStr)
    .sort((a, b) => {
      const d = pdDir === "asc" ? 1 : -1;
      if (pdSort === "stage") return d * (a.stage?.name ?? "").localeCompare(b.stage?.name ?? "");
      return d * a.title.localeCompare(b.title);
    });

  const scheduledPd = (productTasks ?? [])
    .filter(t => t.show_date && t.show_date > todayStr)
    .sort((a, b) => (a.show_date ?? "").localeCompare(b.show_date ?? ""));

  const clScheduledFiltered = Object.fromEntries(
    Object.entries(schedCl).filter(([, d]) => d > todayStr)
  );

  const currentCl = (leads ?? [])
    .filter(l => !clScheduledFiltered[l.id])
    .filter(l => !clOverdue || (l.next_follow_up_at && new Date(l.next_follow_up_at) < today))
    .sort((a, b) => {
      const d = clDir === "asc" ? 1 : -1;
      if (clSort === "status") return d * a.status.localeCompare(b.status);
      if (clSort === "follow_up") {
        if (!a.next_follow_up_at && !b.next_follow_up_at) return 0;
        if (!a.next_follow_up_at) return 1;
        if (!b.next_follow_up_at) return -1;
        return d * a.next_follow_up_at.localeCompare(b.next_follow_up_at);
      }
      return d * a.title.localeCompare(b.title);
    });

  const scheduledCl = (leads ?? [])
    .filter(l => !!clScheduledFiltered[l.id])
    .sort((a, b) => (clScheduledFiltered[a.id] ?? "").localeCompare(clScheduledFiltered[b.id] ?? ""));

  const clOverdueCount = (leads ?? []).filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) < today).length;
  const totalScheduled = scheduledPt.length + scheduledPd.length + scheduledCl.length;

  function shareTaskViaWhatsApp(title: string, path: string) {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const text = `Hi, please check this task in BuildMyWeb CRM:\n*${title}*\nLogin at: ${base}${path}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[#0f1117]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#2a3045] sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-white">My Work</h1>
            <p className="text-xs text-slate-500 mt-0.5">Tasks assigned to you across all modules</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span><span className="font-semibold text-white">{currentPt.length}</span> project</span>
            <span><span className="font-semibold text-white">{currentPd.length}</span> product</span>
            <span><span className="font-semibold text-white">{currentCl.length}</span> enquiries</span>
            <button type="button" onClick={load} title="Refresh"
              className="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-[#2a3045]">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex gap-1 mt-3">
          <button type="button"
            onClick={() => setViewTab("current")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewTab === "current" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-[#1a1f2e]"}`}>
            Current
          </button>
          <button type="button"
            onClick={() => setViewTab("scheduled")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewTab === "scheduled" ? "bg-orange-600 text-white" : "text-slate-400 hover:text-slate-200 hover:bg-[#1a1f2e]"}`}>
            <Calendar className="h-3 w-3" />
            Scheduled
            {totalScheduled > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${viewTab === "scheduled" ? "bg-white/20 text-white" : "bg-orange-500/20 text-orange-400"}`}>
                {totalScheduled}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── SCHEDULED TAB ── */}
      {viewTab === "scheduled" && (
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-[#2a3045]">
          {/* Project tasks scheduled column */}
          <div className="flex min-h-[200px] w-full lg:w-1/3 flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-teal-500/10 p-1.5">
                  <ClipboardList className="h-3.5 w-3.5 text-teal-400" />
                </div>
                <span className="text-sm font-semibold text-white">Project Tasks</span>
                <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">{scheduledPt.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {scheduledPt.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-slate-600">No scheduled project tasks</div>
              ) : (
                <div className="divide-y divide-[#2a3045]/60">
                  {scheduledPt.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-4 py-2.5 gap-2 hover:bg-[#1a1f2e] transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium line-clamp-1">{t.title}</p>
                        {t.project && <p className="text-[11px] text-slate-500 mt-0.5">{t.project.name}</p>}
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="text-[11px] text-orange-400 font-medium whitespace-nowrap">{fmtDate(t.show_date!)}</span>
                        <button type="button" title="Unschedule" onClick={() => unschedulePt(t.id)}
                          className="text-slate-600 hover:text-blue-400 transition-colors p-1 rounded hover:bg-[#2a3045]">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Product tasks scheduled column */}
          <div className="flex min-h-[200px] w-full lg:w-1/3 flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-purple-500/10 p-1.5">
                  <Package className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <span className="text-sm font-semibold text-white">Product Tasks</span>
                <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">{scheduledPd.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {scheduledPd.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-slate-600">No scheduled product tasks</div>
              ) : (
                <div className="divide-y divide-[#2a3045]/60">
                  {scheduledPd.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-4 py-2.5 gap-2 hover:bg-[#1a1f2e] transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium line-clamp-1">{t.title}</p>
                        {t.product?.project_name && <p className="text-[11px] text-slate-500 mt-0.5">{t.product.project_name}</p>}
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="text-[11px] text-orange-400 font-medium whitespace-nowrap">{fmtDate(t.show_date!)}</span>
                        <button type="button" title="Unschedule" onClick={() => unschedulePd(t.id)}
                          className="text-slate-600 hover:text-blue-400 transition-colors p-1 rounded hover:bg-[#2a3045]">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Client enquiry scheduled column */}
          <div className="flex min-h-[200px] w-full lg:w-1/3 flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-500/10 p-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <span className="text-sm font-semibold text-white">Client Enquiry</span>
                <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">{scheduledCl.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {scheduledCl.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-slate-600">No scheduled enquiries</div>
              ) : (
                <div className="divide-y divide-[#2a3045]/60">
                  {scheduledCl.map((l) => (
                    <div key={l.id} className="flex items-center justify-between px-4 py-2.5 gap-2 hover:bg-[#1a1f2e] transition-colors">
                      <div className="flex-1 min-w-0">
                        <Link href={`/client-leads/${l.id}`} className="text-sm text-white hover:text-blue-400 font-medium line-clamp-1 transition-colors block">{l.title}</Link>
                        <span className={`mt-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[l.status] ?? ""}`}>{STATUS_DISPLAY[l.status] ?? l.status}</span>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="text-[11px] text-orange-400 font-medium whitespace-nowrap">{fmtDate(clScheduledFiltered[l.id])}</span>
                        <button type="button" title="Unschedule" onClick={() => unscheduleCl(l.id)}
                          className="text-slate-600 hover:text-blue-400 transition-colors p-1 rounded hover:bg-[#2a3045]">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ── CURRENT TAB ── */}
      {viewTab === "current" && (
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-[#2a3045]">

          {/* ── Column 1: Project Tasks ── */}
          <div className="flex min-h-[200px] w-full lg:w-1/3 flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-teal-500/10 p-1.5">
                  <ClipboardList className="h-3.5 w-3.5 text-teal-400" />
                </div>
                <span className="text-sm font-semibold text-white">Project Tasks</span>
                <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">{currentPt.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setViewTab("scheduled")}
                  className="text-[10px] text-orange-500 hover:text-orange-300 transition-colors">
                  {scheduledPt.length} scheduled
                </button>
                <Link href="/daily-tasks" className="text-[10px] text-slate-500 hover:text-teal-400 transition-colors">All →</Link>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {currentPt.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-slate-600">
                  No project tasks assigned to you
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[#0f1117] border-b border-[#2a3045]">
                    <tr>
                      <th className="px-4 py-2 text-left">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Task</span>
                          <SortBtn label="Project" active={ptSort === "project"} dir={ptDir}
                            onClick={() => toggle("project", ptSort, ptDir, setPtSort, setPtDir, LS_SORT_PT)} />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <SortBtn label="Stage" active={ptSort === "stage"} dir={ptDir}
                          onClick={() => toggle("stage", ptSort, ptDir, setPtSort, setPtDir, LS_SORT_PT)} />
                      </th>
                      <th className="w-16 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {currentPt.map((t) => (
                      <tr key={t.id}
                        className="border-b border-[#2a3045]/60 last:border-0 hover:bg-[#1a1f2e] transition-colors group">
                        <td className="px-4 py-2.5">
                          <p className="text-sm text-white font-medium line-clamp-1 leading-snug">{t.title}</p>
                          {t.project && (
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{t.project.name}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {t.stage?.name
                            ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-500/10 border-slate-500/20 whitespace-nowrap">{t.stage.name}</span>
                            : <span className="text-slate-700 text-xs">—</span>}
                          {t.priority && <div className="mt-0.5 text-[10px] capitalize text-slate-500">{t.priority}</div>}
                          {t.target_date && <div className="text-[10px] text-slate-600">{fmtDate(t.target_date)}</div>}
                        </td>
                        <td className="pr-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); shareTaskViaWhatsApp(t.title, "/daily-tasks"); }}
                              className="text-slate-600 hover:text-green-400 transition-colors" title="Share via WhatsApp">
                              <Share2 className="h-3.5 w-3.5" />
                            </button>
                            <div className="relative">
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); setHideMenuId(prev => prev === t.id ? null : t.id); }}
                                className="text-slate-600 hover:text-orange-400 transition-colors" title="Schedule for later">
                                <EyeOff className="h-3.5 w-3.5" />
                              </button>
                              {hideMenuId === t.id && (
                                <ScheduleMenu
                                  onTomorrow={() => schedulePt(t.id, tomorrowStr())}
                                  onDate={(d) => schedulePt(t.id, d)}
                                  onClose={() => setHideMenuId(null)}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Column 2: Product Tasks ── */}
          <div className="flex min-h-[200px] w-full lg:w-1/3 flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-purple-500/10 p-1.5">
                  <Package className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <span className="text-sm font-semibold text-white">Product Tasks</span>
                <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">{currentPd.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setViewTab("scheduled")}
                  className="text-[10px] text-orange-500 hover:text-orange-300 transition-colors">
                  {scheduledPd.length} scheduled
                </button>
                <Link href="/product-tasks" className="text-[10px] text-slate-500 hover:text-purple-400 transition-colors">All →</Link>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {currentPd.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-slate-600">
                  No product tasks assigned to you
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[#0f1117] border-b border-[#2a3045]">
                    <tr>
                      <th className="px-4 py-2 text-left">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Task</span>
                          <SortBtn label="Product" active={pdSort === "title"} dir={pdDir}
                            onClick={() => toggle("title", pdSort, pdDir, setPdSort, setPdDir, LS_SORT_PD)} />
                        </div>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <SortBtn label="Stage" active={pdSort === "stage"} dir={pdDir}
                          onClick={() => toggle("stage", pdSort, pdDir, setPdSort, setPdDir, LS_SORT_PD)} />
                      </th>
                      <th className="w-16 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {currentPd.map((t) => (
                      <tr key={t.id}
                        className="border-b border-[#2a3045]/60 last:border-0 hover:bg-[#1a1f2e] transition-colors group">
                        <td className="px-4 py-2.5">
                          <p className="text-sm text-white font-medium line-clamp-2 leading-snug">{t.title}</p>
                          {t.product?.project_name && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{t.product.project_name}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {t.stage?.name
                            ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-500/10 border-slate-500/20 whitespace-nowrap">{t.stage.name}</span>
                            : <span className="text-slate-700 text-xs">—</span>}
                          {t.priority && <div className="mt-0.5 text-[10px] capitalize text-slate-500">{t.priority}</div>}
                          {t.due_date && <div className="text-[10px] text-slate-600">{fmtDate(t.due_date)}</div>}
                        </td>
                        <td className="pr-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); shareTaskViaWhatsApp(t.title, "/product-tasks"); }}
                              className="text-slate-600 hover:text-green-400 transition-colors" title="Share via WhatsApp">
                              <Share2 className="h-3.5 w-3.5" />
                            </button>
                            <div className="relative">
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); setHideMenuId(prev => prev === t.id ? null : t.id); }}
                                className="text-slate-600 hover:text-orange-400 transition-colors" title="Schedule for later">
                                <EyeOff className="h-3.5 w-3.5" />
                              </button>
                              {hideMenuId === t.id && (
                                <ScheduleMenu
                                  onTomorrow={() => schedulePd(t.id, tomorrowStr())}
                                  onDate={(d) => schedulePd(t.id, d)}
                                  onClose={() => setHideMenuId(null)}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Column 3: Client Enquiry ── */}
          <div className="flex min-h-[200px] w-full lg:w-1/3 flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-500/10 p-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <span className="text-sm font-semibold text-white">Client Enquiry</span>
                <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">{currentCl.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setViewTab("scheduled")}
                  className="text-[10px] text-orange-500 hover:text-orange-300 transition-colors">
                  {scheduledCl.length} scheduled
                </button>
                {clOverdueCount > 0 && (
                  <button type="button" onClick={() => setClOverdue((v) => !v)}
                    className={`text-[10px] font-medium transition-colors ${clOverdue ? "text-red-300" : "text-red-400 hover:text-red-300"}`}>
                    {clOverdueCount} overdue
                  </button>
                )}
                <Link href="/client-leads" className="text-[10px] text-slate-500 hover:text-blue-400 transition-colors">All →</Link>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {currentCl.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-xs text-slate-600">
                  No enquiries assigned to you
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-[#0f1117] border-b border-[#2a3045]">
                    <tr>
                      <th className="px-4 py-2 text-left">
                        <SortBtn label="Client" active={clSort === "title"} dir={clDir}
                          onClick={() => toggle("title", clSort, clDir, setClSort, setClDir)} />
                      </th>
                      <th className="px-3 py-2 text-left">
                        <SortBtn label="Status" active={clSort === "status"} dir={clDir}
                          onClick={() => toggle("status", clSort, clDir, setClSort, setClDir)} />
                      </th>
                      <th className="px-3 py-2 text-left">
                        <SortBtn label="Follow Up" active={clSort === "follow_up"} dir={clDir}
                          onClick={() => toggle("follow_up", clSort, clDir, setClSort, setClDir)} />
                      </th>
                      <th className="w-16 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {currentCl.map((l) => {
                      const fu = l.next_follow_up_at ? new Date(l.next_follow_up_at) : null;
                      const isOverdue = fu && fu < today;
                      return (
                        <tr key={l.id}
                          className="border-b border-[#2a3045]/60 last:border-0 hover:bg-[#1a1f2e] transition-colors group">
                          <td className="px-4 py-2.5">
                            <Link href={`/client-leads/${l.id}`}
                              className="text-sm text-white hover:text-blue-400 font-medium line-clamp-2 leading-snug transition-colors block">
                              {l.title}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${STATUS_BADGE[l.status] ?? ""}`}>
                              {STATUS_DISPLAY[l.status] ?? l.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {fu
                              ? <span className={`text-[11px] font-medium whitespace-nowrap ${isOverdue ? "text-red-400" : "text-slate-400"}`}>
                                  {fu.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                </span>
                              : <span className="text-slate-700 text-xs">—</span>}
                          </td>
                          <td className="pr-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); shareTaskViaWhatsApp(l.title, `/client-leads/${l.id}`); }}
                                className="text-slate-600 hover:text-green-400 transition-colors" title="Share via WhatsApp">
                                <Share2 className="h-3.5 w-3.5" />
                              </button>
                              <div className="relative">
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); setHideMenuId(prev => prev === l.id ? null : l.id); }}
                                  className="text-slate-600 hover:text-orange-400 transition-colors" title="Schedule for later">
                                  <EyeOff className="h-3.5 w-3.5" />
                                </button>
                                {hideMenuId === l.id && (
                                  <ScheduleMenu
                                    onTomorrow={() => scheduleCl(l.id, tomorrowStr())}
                                    onDate={(d) => scheduleCl(l.id, d)}
                                    onClose={() => setHideMenuId(null)}
                                  />
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
