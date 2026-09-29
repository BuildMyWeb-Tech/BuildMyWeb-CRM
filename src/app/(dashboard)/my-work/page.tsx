"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown, ChevronUp, ChevronsUpDown, Loader2,
  ClipboardList, Package, UserPlus, Eye, EyeOff,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface ProjectTask {
  id: string; title: string;
  show_date: string | null;
  stage?: { name: string } | null;
  project?: { id: string; name: string } | null;
  assignee_user_id: string | null; assignee_user_ids: string[];
}
interface ProductTask {
  id: string; title: string;
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

const LS_HIDDEN_PT = "mw-hidden-pt";
const LS_HIDDEN_PD = "mw-hidden-pd";
const LS_HIDDEN_CL = "mw-hidden-cl";

function loadHidden(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
function saveHidden(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...ids])); } catch {}
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

export default function MyWorkPage() {
  const { user, accountId } = useAuth();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [projectTasks, setProjectTasks] = useState<ProjectTask[] | null>(null);
  const [productTasks, setProductTasks] = useState<ProductTask[] | null>(null);
  const [leads, setLeads] = useState<ClientLead[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Hidden row sets (persisted to localStorage)
  const [hiddenPt, setHiddenPt] = useState<Set<string>>(new Set());
  const [hiddenPd, setHiddenPd] = useState<Set<string>>(new Set());
  const [hiddenCl, setHiddenCl] = useState<Set<string>>(new Set());

  // Show-hidden toggle (per column)
  const [showHiddenPt, setShowHiddenPt] = useState(false);
  const [showHiddenPd, setShowHiddenPd] = useState(false);
  const [showHiddenCl, setShowHiddenCl] = useState(false);

  // Load hidden state from localStorage on mount
  useEffect(() => {
    setHiddenPt(loadHidden(LS_HIDDEN_PT));
    setHiddenPd(loadHidden(LS_HIDDEN_PD));
    setHiddenCl(loadHidden(LS_HIDDEN_CL));
  }, []);

  function toggleHide(
    id: string,
    hidden: Set<string>,
    setHidden: (s: Set<string>) => void,
    lsKey: string,
  ) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    setHidden(next);
    saveHidden(lsKey, next);
  }

  // Per-column overdue filter
  const [clOverdue, setClOverdue] = useState(false);

  // Per-column sort — project tasks: sort by project only (no task-title sort)
  const [ptSort, setPtSort] = useState<"project" | "stage">("project");
  const [ptDir, setPtDir] = useState<SortDir>("asc");
  const [pdSort, setPdSort] = useState<"title" | "stage">("title");
  const [pdDir, setPdDir] = useState<SortDir>("asc");
  const [clSort, setClSort] = useState<"title" | "follow_up" | "status">("follow_up");
  const [clDir, setClDir] = useState<SortDir>("asc");

  function toggle<T extends string>(
    field: T, cur: T, dir: SortDir,
    setF: (f: T) => void, setD: (d: SortDir) => void,
  ) {
    if (cur === field) setD(dir === "asc" ? "desc" : "asc");
    else { setF(field); setD("asc"); }
  }

  const load = useCallback(async () => {
    if (!accountId || !user?.id) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const uid = user.id;
      const nowStr = new Date().toISOString().slice(0, 10);

      const ptSelect = "id, title, show_date, stage:pipeline_stages(name), project:projects(id, name), assignee_user_id, assignee_user_ids";
      const pdSelect = "id, title, show_date, stage:pipeline_stages(name), product:products(project_name), product_id, assignee_user_id, assignee_user_ids";
      const assigneeFilter = `assignee_user_id.eq.${uid},assignee_user_ids.cs.{${uid}}`;

      // Single query per table (all assigned tasks), then JS-side filter
      // mirrors UnifiedTasksView's "current" logic: exclude show_date > today
      const [ptRes, pdRes, clRes] = await Promise.all([
        supabase.from("project_tasks").select(ptSelect)
          .eq("account_id", accountId).or(assigneeFilter),
        supabase.from("product_tasks").select(pdSelect)
          .eq("account_id", accountId).or(assigneeFilter),
        supabase.from("client_leads")
          .select("id, title, status, next_follow_up_at, allocated_user_id, allocated_user_ids")
          .eq("account_id", accountId)
          .or(`allocated_user_id.eq.${uid},allocated_user_ids.cs.{${uid}}`),
      ]);

      // Same filter as UnifiedTasksView "current" tab: hide if show_date is in the future
      const isCurrent = (t: { show_date: string | null }) =>
        !t.show_date || t.show_date <= nowStr;

      const normPt = (ptRes.data ?? [])
        .filter(isCurrent)
        .map((t: Record<string, unknown>) => ({
          ...t,
          stage: Array.isArray(t.stage) ? (t.stage[0] ?? null) : t.stage,
          project: Array.isArray(t.project) ? (t.project[0] ?? null) : t.project,
        })) as ProjectTask[];

      const normPd = (pdRes.data ?? [])
        .filter(isCurrent)
        .map((t: Record<string, unknown>) => ({
          ...t,
          stage: Array.isArray(t.stage) ? (t.stage[0] ?? null) : t.stage,
          product: Array.isArray(t.product) ? (t.product[0] ?? null) : t.product,
        })) as ProductTask[];

      setProjectTasks(normPt);
      setProductTasks(normPd);
      setLeads(clRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [accountId, user?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const visiblePt = (projectTasks ?? [])
    .sort((a, b) => {
      const d = ptDir === "asc" ? 1 : -1;
      if (ptSort === "stage") return d * (a.stage?.name ?? "").localeCompare(b.stage?.name ?? "");
      return d * (a.project?.name ?? "").localeCompare(b.project?.name ?? "");
    });

  const visiblePd = (productTasks ?? [])
    .sort((a, b) => {
      const d = pdDir === "asc" ? 1 : -1;
      if (pdSort === "stage") return d * (a.stage?.name ?? "").localeCompare(b.stage?.name ?? "");
      return d * a.title.localeCompare(b.title);
    });

  const visibleCl = (leads ?? [])
    .filter((l) => !clOverdue || (l.next_follow_up_at && new Date(l.next_follow_up_at) < today))
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

  const clOverdueCount = (leads ?? []).filter((l) => l.next_follow_up_at && new Date(l.next_follow_up_at) < today).length;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[#0f1117]">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4 flex items-center justify-between border-b border-[#2a3045]">
        <div>
          <h1 className="text-xl font-bold text-white">My Work</h1>
          <p className="text-xs text-slate-500 mt-0.5">Tasks assigned to you across all modules</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span><span className="font-semibold text-white">{(projectTasks ?? []).length}</span> project tasks</span>
          <span><span className="font-semibold text-white">{(productTasks ?? []).length}</span> product tasks</span>
          <span><span className="font-semibold text-white">{(leads ?? []).length}</span> enquiries</span>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden divide-x divide-[#2a3045]">

        {/* ── Column 1: Project Tasks ── */}
        <div className="flex w-1/3 flex-col overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-teal-500/10 p-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-teal-400" />
              </div>
              <span className="text-sm font-semibold text-white">Project Tasks</span>
              <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">
                {visiblePt.filter((t) => !hiddenPt.has(t.id) || showHiddenPt).length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hiddenPt.size > 0 && (
                <button type="button" onClick={() => setShowHiddenPt(v => !v)}
                  className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                  {showHiddenPt ? "hide hidden" : `${hiddenPt.size} hidden`}
                </button>
              )}
              <Link href="/daily-tasks" className="text-[10px] text-slate-500 hover:text-teal-400 transition-colors">All →</Link>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {visiblePt.length === 0 ? (
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
                          onClick={() => toggle("project", ptSort, ptDir, setPtSort, setPtDir)} />
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <SortBtn label="Stage" active={ptSort === "stage"} dir={ptDir}
                        onClick={() => toggle("stage", ptSort, ptDir, setPtSort, setPtDir)} />
                    </th>
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visiblePt.map((t) => {
                    const isHidden = hiddenPt.has(t.id);
                    if (isHidden && !showHiddenPt) return null;
                    return (
                      <tr key={t.id}
                        className={`border-b border-[#2a3045]/60 last:border-0 hover:bg-[#1a1f2e] transition-colors group ${isHidden ? "opacity-30" : ""}`}>
                        <td className="px-4 py-2.5">
                          <p className="text-sm text-white font-medium line-clamp-2 leading-snug">{t.title}</p>
                          {t.project && (
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{t.project.name}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {t.stage?.name
                            ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-500/10 border-slate-500/20 whitespace-nowrap">{t.stage.name}</span>
                            : <span className="text-slate-700 text-xs">—</span>}
                        </td>
                        <td className="pr-3 py-2.5 text-right">
                          <button type="button"
                            onClick={() => toggleHide(t.id, hiddenPt, setHiddenPt, LS_HIDDEN_PT)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-slate-300">
                            {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Column 2: Product Tasks ── */}
        <div className="flex w-1/3 flex-col overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-purple-500/10 p-1.5">
                <Package className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <span className="text-sm font-semibold text-white">Product Tasks</span>
              <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">
                {visiblePd.filter((t) => !hiddenPd.has(t.id) || showHiddenPd).length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hiddenPd.size > 0 && (
                <button type="button" onClick={() => setShowHiddenPd(v => !v)}
                  className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                  {showHiddenPd ? "hide hidden" : `${hiddenPd.size} hidden`}
                </button>
              )}
              <Link href="/product-tasks" className="text-[10px] text-slate-500 hover:text-purple-400 transition-colors">All →</Link>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {visiblePd.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-xs text-slate-600">
                No product tasks assigned to you
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-[#0f1117] border-b border-[#2a3045]">
                  <tr>
                    <th className="px-4 py-2 text-left">
                      <SortBtn label="Task" active={pdSort === "title"} dir={pdDir}
                        onClick={() => toggle("title", pdSort, pdDir, setPdSort, setPdDir)} />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <SortBtn label="Stage" active={pdSort === "stage"} dir={pdDir}
                        onClick={() => toggle("stage", pdSort, pdDir, setPdSort, setPdDir)} />
                    </th>
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visiblePd.map((t) => {
                    const isHidden = hiddenPd.has(t.id);
                    if (isHidden && !showHiddenPd) return null;
                    return (
                      <tr key={t.id}
                        className={`border-b border-[#2a3045]/60 last:border-0 hover:bg-[#1a1f2e] transition-colors group ${isHidden ? "opacity-30" : ""}`}>
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
                        </td>
                        <td className="pr-3 py-2.5 text-right">
                          <button type="button"
                            onClick={() => toggleHide(t.id, hiddenPd, setHiddenPd, LS_HIDDEN_PD)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-slate-300">
                            {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Column 3: Client Enquiry ── */}
        <div className="flex w-1/3 flex-col overflow-hidden">
          <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#1a1f2e] border-b border-[#2a3045]">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-blue-500/10 p-1.5">
                <UserPlus className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <span className="text-sm font-semibold text-white">Client Enquiry</span>
              <span className="rounded-full bg-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400">
                {visibleCl.filter((l) => !hiddenCl.has(l.id) || showHiddenCl).length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hiddenCl.size > 0 && (
                <button type="button" onClick={() => setShowHiddenCl(v => !v)}
                  className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                  {showHiddenCl ? "hide hidden" : `${hiddenCl.size} hidden`}
                </button>
              )}
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
            {visibleCl.length === 0 ? (
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
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleCl.map((l) => {
                    const fu = l.next_follow_up_at ? new Date(l.next_follow_up_at) : null;
                    const isOverdue = fu && fu < today;
                    const isHidden = hiddenCl.has(l.id);
                    if (isHidden && !showHiddenCl) return null;
                    return (
                      <tr key={l.id}
                        className={`border-b border-[#2a3045]/60 last:border-0 hover:bg-[#1a1f2e] transition-colors group ${isHidden ? "opacity-30" : ""}`}>
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
                        <td className="pr-3 py-2.5 text-right">
                          <button type="button"
                            onClick={() => toggleHide(l.id, hiddenCl, setHiddenCl, LS_HIDDEN_CL)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-slate-300">
                            {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </button>
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
    </div>
  );
}
