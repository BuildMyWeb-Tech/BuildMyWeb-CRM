"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown, ChevronUp, ChevronsUpDown, Loader2,
  ClipboardList, Package, UserPlus, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────
interface ProjectTask {
  id: string; title: string; priority: string; due_date: string | null;
  show_date: string | null; stage?: { name: string } | null;
  project?: { id: string; name: string } | null;
  assignee_user_id: string | null; assignee_user_ids: string[];
}
interface ProductTask {
  id: string; title: string; priority: string; due_date: string | null;
  show_date: string | null; stage?: { name: string } | null;
  product?: { project_name?: string } | null;
  product_id: string | null;
  assignee_user_id: string | null; assignee_user_ids: string[];
}
interface ClientLead {
  id: string; title: string; priority: string | null;
  status: string; next_follow_up_at: string | null;
  allocated_user_id: string | null; allocated_user_ids: string[];
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/20 border-red-500/30",
  high: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/20 border-blue-500/30",
};
const STATUS_BADGE: Record<string, string> = {
  in_discussion: "text-blue-400 bg-blue-500/20 border-blue-500/30",
  hold: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
  confirmed: "text-green-400 bg-green-500/20 border-green-500/30",
  rejected: "text-red-400 bg-red-500/20 border-red-500/30",
};
const STATUS_DISPLAY: Record<string, string> = {
  in_discussion: "Discussion", hold: "Hold", confirmed: "Converted", rejected: "Rejected",
};
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

type SortDir = "asc" | "desc";

function ColBtn({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors">
      {label}
      {active
        ? dir === "asc" ? <ChevronUp className="h-2.5 w-2.5 text-blue-400" /> : <ChevronDown className="h-2.5 w-2.5 text-blue-400" />
        : <ChevronsUpDown className="h-2.5 w-2.5 text-slate-700" />}
    </button>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  icon, title, color, total, overdue, inProgress, open, onToggle, children,
}: {
  icon: React.ReactNode; title: string; color: string; total: number;
  overdue: number; inProgress: number; open: boolean; onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
      <button type="button" onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-[#0f1117]/40 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${color}`}>{icon}</div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[11px] text-slate-500">{total} task{total !== 1 ? "s" : ""}</span>
              {overdue > 0 && <span className="text-[11px] font-medium text-red-400">{overdue} overdue</span>}
              {inProgress > 0 && <span className="text-[11px] text-blue-400">{inProgress} in progress</span>}
            </div>
          </div>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-slate-500" />
          : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open && <div className="border-t border-[#2a3045]">{children}</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MyWorkPage() {
  const { user, accountId } = useAuth();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [projectTasks, setProjectTasks] = useState<ProjectTask[] | null>(null);
  const [productTasks, setProductTasks] = useState<ProductTask[] | null>(null);
  const [leads, setLeads] = useState<ClientLead[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Section open/closed
  const [openProject, setOpenProject] = useState(true);
  const [openProduct, setOpenProduct] = useState(true);
  const [openLeads, setOpenLeads] = useState(true);

  // Filters per section
  const [ptOverdue, setPtOverdue] = useState(false);
  const [ptSort, setPtSort] = useState<"title" | "priority" | "due_date" | "stage">("due_date");
  const [ptDir, setPtDir] = useState<SortDir>("asc");

  const [pdOverdue, setPdOverdue] = useState(false);
  const [pdSort, setPdSort] = useState<"title" | "priority" | "due_date" | "stage">("due_date");
  const [pdDir, setPdDir] = useState<SortDir>("asc");

  const [clOverdue, setClOverdue] = useState(false);
  const [clSort, setClSort] = useState<"title" | "priority" | "follow_up" | "status">("follow_up");
  const [clDir, setClDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    if (!accountId || !user?.id) return;
    setLoading(true);
    try {
      const supabase = createClient();

      // Project Tasks — assigned to current user, current tasks only (no future show_date)
      const { data: pt } = await supabase
        .from("project_tasks")
        .select("id, title, priority, due_date, show_date, stage:pipeline_stages(name), project:projects(id, name), assignee_user_id, assignee_user_ids")
        .eq("account_id", accountId)
        .or(`assignee_user_id.eq.${user.id},assignee_user_ids.cs.{${user.id}}`);

      // Product Tasks
      const { data: pd } = await supabase
        .from("product_tasks")
        .select("id, title, priority, due_date, show_date, stage:pipeline_stages(name), product:products(project_name), product_id, assignee_user_id, assignee_user_ids")
        .eq("account_id", accountId)
        .or(`assignee_user_id.eq.${user.id},assignee_user_ids.cs.{${user.id}}`);

      // Client leads allocated to user
      const { data: cl } = await supabase
        .from("client_leads")
        .select("id, title, priority, status, next_follow_up_at, allocated_user_id, allocated_user_ids")
        .eq("account_id", accountId)
        .or(`allocated_user_id.eq.${user.id},allocated_user_ids.cs.{${user.id}}`);

      // Filter out scheduled tasks (show_date in future)
      const nowStr = new Date().toISOString().slice(0, 10);
      // Supabase returns joined relations as arrays; cast to our flat interface shape.
      const normPt = (pt ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        stage: Array.isArray(t.stage) ? t.stage[0] ?? null : t.stage,
        project: Array.isArray(t.project) ? t.project[0] ?? null : t.project,
      })) as ProjectTask[];
      const normPd = (pd ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        stage: Array.isArray(t.stage) ? t.stage[0] ?? null : t.stage,
        product: Array.isArray(t.product) ? t.product[0] ?? null : t.product,
      })) as ProductTask[];
      setProjectTasks(normPt.filter((t) => !t.show_date || t.show_date <= nowStr));
      setProductTasks(normPd.filter((t) => !t.show_date || t.show_date <= nowStr));
      setLeads(cl ?? []);
    } finally {
      setLoading(false);
    }
  }, [accountId, user?.id]);

  useEffect(() => { load(); }, [load]);

  function toggleSort<T extends string>(
    field: T, current: T, dir: SortDir,
    setField: (f: T) => void, setDir: (d: SortDir) => void,
  ) {
    if (current === field) setDir(dir === "asc" ? "desc" : "asc");
    else { setField(field); setDir("asc"); }
  }

  // ── Sorted + filtered project tasks ─────────────────────────────────────
  const visiblePt = (projectTasks ?? [])
    .filter((t) => !ptOverdue || (t.due_date && t.due_date < todayStr))
    .sort((a, b) => {
      const d = ptDir === "asc" ? 1 : -1;
      if (ptSort === "priority") return d * ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
      if (ptSort === "due_date") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1; if (!b.due_date) return -1;
        return d * a.due_date.localeCompare(b.due_date);
      }
      if (ptSort === "stage") return d * (a.stage?.name ?? "").localeCompare(b.stage?.name ?? "");
      return d * a.title.localeCompare(b.title);
    });

  const ptOverdueCount = (projectTasks ?? []).filter((t) => t.due_date && t.due_date < todayStr).length;
  const ptInProgress = (projectTasks ?? []).filter((t) => t.stage?.name?.toLowerCase().includes("progress")).length;

  // ── Sorted + filtered product tasks ─────────────────────────────────────
  const visiblePd = (productTasks ?? [])
    .filter((t) => !pdOverdue || (t.due_date && t.due_date < todayStr))
    .sort((a, b) => {
      const d = pdDir === "asc" ? 1 : -1;
      if (pdSort === "priority") return d * ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
      if (pdSort === "due_date") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1; if (!b.due_date) return -1;
        return d * a.due_date.localeCompare(b.due_date);
      }
      if (pdSort === "stage") return d * (a.stage?.name ?? "").localeCompare(b.stage?.name ?? "");
      return d * a.title.localeCompare(b.title);
    });

  const pdOverdueCount = (productTasks ?? []).filter((t) => t.due_date && t.due_date < todayStr).length;
  const pdInProgress = (productTasks ?? []).filter((t) => t.stage?.name?.toLowerCase().includes("progress")).length;

  // ── Sorted + filtered leads ──────────────────────────────────────────────
  const visibleCl = (leads ?? [])
    .filter((l) => !clOverdue || (l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date()))
    .sort((a, b) => {
      const d = clDir === "asc" ? 1 : -1;
      if (clSort === "priority") return d * ((PRIORITY_ORDER[a.priority ?? "low"] ?? 9) - (PRIORITY_ORDER[b.priority ?? "low"] ?? 9));
      if (clSort === "follow_up") {
        if (!a.next_follow_up_at && !b.next_follow_up_at) return 0;
        if (!a.next_follow_up_at) return 1; if (!b.next_follow_up_at) return -1;
        return d * a.next_follow_up_at.localeCompare(b.next_follow_up_at);
      }
      if (clSort === "status") return d * (a.status ?? "").localeCompare(b.status ?? "");
      return d * a.title.localeCompare(b.title);
    });

  const clOverdueCount = (leads ?? []).filter((l) => l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date()).length;
  const clInDiscussion = (leads ?? []).filter((l) => l.status === "in_discussion").length;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-auto bg-[#0f1117]">
      <div className="flex-1 max-w-5xl mx-auto px-6 py-6 space-y-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">My Work</h1>
          <p className="text-sm text-slate-500 mt-1">Your current tasks across all modules</p>
        </div>

        {/* ── Section 1: Project Tasks ──────────────────────────────────── */}
        <Section
          icon={<ClipboardList className="h-4 w-4 text-teal-400" />}
          color="bg-teal-500/10"
          title="Project Tasks"
          total={projectTasks?.length ?? 0}
          overdue={ptOverdueCount}
          inProgress={ptInProgress}
          open={openProject}
          onToggle={() => setOpenProject((v) => !v)}
        >
          {/* Filter row */}
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-[#2a3045] bg-[#0f1117]/40">
            <button type="button" onClick={() => setPtOverdue((v) => !v)}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${ptOverdue ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-[#2a3045] text-slate-500 hover:text-slate-300"}`}>
              <AlertCircle className="h-3 w-3" /> Overdue
            </button>
            <Link href="/daily-tasks" className="ml-auto text-[11px] text-slate-500 hover:text-teal-400 transition-colors">View all →</Link>
          </div>

          {visiblePt.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-600">No current project tasks assigned to you</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3045] bg-[#1a1f2e] px-5">
                  <th className="px-5 py-2.5 text-left">
                    <ColBtn label="Task" active={ptSort === "title"} dir={ptDir} onClick={() => toggleSort("title", ptSort, ptDir, setPtSort, setPtDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Stage" active={ptSort === "stage"} dir={ptDir} onClick={() => toggleSort("stage", ptSort, ptDir, setPtSort, setPtDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Priority" active={ptSort === "priority"} dir={ptDir} onClick={() => toggleSort("priority", ptSort, ptDir, setPtSort, setPtDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Target Date" active={ptSort === "due_date"} dir={ptDir} onClick={() => toggleSort("due_date", ptSort, ptDir, setPtSort, setPtDir)} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiblePt.map((t) => {
                  const isOverdue = t.due_date && t.due_date < todayStr;
                  return (
                    <tr key={t.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#0f1117]/40 transition-colors">
                      <td className="px-5 py-2.5">
                        <div>
                          <p className="text-sm text-white font-medium line-clamp-1">{t.title}</p>
                          {t.project && <p className="text-[11px] text-slate-500">{t.project.name}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.stage?.name
                          ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-500/10 border-slate-500/20">{t.stage.name}</span>
                          : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[t.priority] ?? ""}`}>{t.priority}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.due_date
                          ? <span className={`text-xs font-medium ${isOverdue ? "text-red-400" : "text-slate-400"}`}>
                              {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* ── Section 2: Product Tasks ──────────────────────────────────── */}
        <Section
          icon={<Package className="h-4 w-4 text-purple-400" />}
          color="bg-purple-500/10"
          title="Product Tasks"
          total={productTasks?.length ?? 0}
          overdue={pdOverdueCount}
          inProgress={pdInProgress}
          open={openProduct}
          onToggle={() => setOpenProduct((v) => !v)}
        >
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-[#2a3045] bg-[#0f1117]/40">
            <button type="button" onClick={() => setPdOverdue((v) => !v)}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${pdOverdue ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-[#2a3045] text-slate-500 hover:text-slate-300"}`}>
              <AlertCircle className="h-3 w-3" /> Overdue
            </button>
            <Link href="/product-tasks" className="ml-auto text-[11px] text-slate-500 hover:text-purple-400 transition-colors">View all →</Link>
          </div>

          {visiblePd.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-600">No current product tasks assigned to you</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3045] bg-[#1a1f2e]">
                  <th className="px-5 py-2.5 text-left">
                    <ColBtn label="Task" active={pdSort === "title"} dir={pdDir} onClick={() => toggleSort("title", pdSort, pdDir, setPdSort, setPdDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Stage" active={pdSort === "stage"} dir={pdDir} onClick={() => toggleSort("stage", pdSort, pdDir, setPdSort, setPdDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Priority" active={pdSort === "priority"} dir={pdDir} onClick={() => toggleSort("priority", pdSort, pdDir, setPdSort, setPdDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Target Date" active={pdSort === "due_date"} dir={pdDir} onClick={() => toggleSort("due_date", pdSort, pdDir, setPdSort, setPdDir)} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiblePd.map((t) => {
                  const isOverdue = t.due_date && t.due_date < todayStr;
                  return (
                    <tr key={t.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#0f1117]/40 transition-colors">
                      <td className="px-5 py-2.5">
                        <div>
                          <p className="text-sm text-white font-medium line-clamp-1">{t.title}</p>
                          {t.product?.project_name && <p className="text-[11px] text-slate-500">{t.product.project_name}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.stage?.name
                          ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-500/10 border-slate-500/20">{t.stage.name}</span>
                          : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[t.priority] ?? ""}`}>{t.priority}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.due_date
                          ? <span className={`text-xs font-medium ${isOverdue ? "text-red-400" : "text-slate-400"}`}>
                              {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                            </span>
                          : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* ── Section 3: Client Enquiry ─────────────────────────────────── */}
        <Section
          icon={<UserPlus className="h-4 w-4 text-blue-400" />}
          color="bg-blue-500/10"
          title="Client Enquiry"
          total={leads?.length ?? 0}
          overdue={clOverdueCount}
          inProgress={clInDiscussion}
          open={openLeads}
          onToggle={() => setOpenLeads((v) => !v)}
        >
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-[#2a3045] bg-[#0f1117]/40">
            <button type="button" onClick={() => setClOverdue((v) => !v)}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${clOverdue ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-[#2a3045] text-slate-500 hover:text-slate-300"}`}>
              <AlertCircle className="h-3 w-3" /> Overdue
            </button>
            <Link href="/client-leads" className="ml-auto text-[11px] text-slate-500 hover:text-blue-400 transition-colors">View all →</Link>
          </div>

          {visibleCl.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-600">No client enquiries assigned to you</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3045] bg-[#1a1f2e]">
                  <th className="px-5 py-2.5 text-left">
                    <ColBtn label="Client" active={clSort === "title"} dir={clDir} onClick={() => toggleSort("title", clSort, clDir, setClSort, setClDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Priority" active={clSort === "priority"} dir={clDir} onClick={() => toggleSort("priority", clSort, clDir, setClSort, setClDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Status" active={clSort === "status"} dir={clDir} onClick={() => toggleSort("status", clSort, clDir, setClSort, setClDir)} />
                  </th>
                  <th className="px-4 py-2.5 text-left">
                    <ColBtn label="Next Follow Up" active={clSort === "follow_up"} dir={clDir} onClick={() => toggleSort("follow_up", clSort, clDir, setClSort, setClDir)} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleCl.map((l) => {
                  const fu = l.next_follow_up_at ? new Date(l.next_follow_up_at) : null;
                  const isOverdue = fu && fu < new Date();
                  return (
                    <tr key={l.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#0f1117]/40 transition-colors">
                      <td className="px-5 py-2.5">
                        <Link href={`/client-leads/${l.id}`} className="text-sm text-white hover:text-blue-400 font-medium line-clamp-1 transition-colors">
                          {l.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        {l.priority
                          ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[l.priority] ?? ""}`}>{l.priority}</span>
                          : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[l.status] ?? ""}`}>
                          {STATUS_DISPLAY[l.status] ?? l.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {fu
                          ? <span className={`text-xs font-medium ${isOverdue ? "text-red-400" : "text-slate-400"}`}>
                              {fu.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          : <span className="text-slate-600 text-xs">Not set</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}
