"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Folder, Search, Kanban, ClipboardList,
  ExternalLink, ListChecks, MessageSquare, Package,
  ChevronUp, ChevronDown, ChevronsUpDown, ArrowUpRight,
  PhoneCall, CheckCircle2, XCircle, Clock, UserCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { UnifiedTasksView } from "@/components/daily-tasks/unified-tasks-view";
import Link from "next/link";
import type { Project } from "@/types";
import { toast } from "sonner";

const PROJECT_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-teal-500", "bg-orange-500",
  "bg-pink-500", "bg-green-500", "bg-yellow-500", "bg-red-500",
];

function getProjectColor(index: number) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

interface ProjectWithTaskCount extends Project {
  task_count?: number;
}

interface ClientLead {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  phone?: string | null;
}

interface ProjectChatMessage {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string;
  project_id: string;
  project?: { id: string; name: string } | null;
  sender?: { full_name: string | null } | null;
}

interface KanbanCard {
  id: string;
  title: string;
  priority: string;
  due_date: string | null;
  board_id: string;
  stage_id: string;
  board?: { id: string; name: string } | null;
  stage?: { id: string; name: string } | null;
}

interface ProductTask {
  id: string;
  title: string;
  priority: string;
  due_date: string | null;
  product_id: string | null;
  product?: { id: string; name: string } | null;
}

type TabKey = "project-tasks" | "enquiry-tasks" | "product-tasks" | "kanban" | "project-chats";
type SortDir = "asc" | "desc";
type EnqSortField = "title" | "status" | "priority" | "next_follow_up_at";
type PtSortField = "title" | "priority" | "due_date";

const TABS: { key: TabKey; label: string; icon: typeof ListChecks }[] = [
  { key: "project-tasks", label: "Project Tasks", icon: ListChecks },
  { key: "enquiry-tasks", label: "Enquiry Tasks", icon: ClipboardList },
  { key: "product-tasks", label: "Product Tasks", icon: Package },
  { key: "kanban", label: "Kanban", icon: Kanban },
  { key: "project-chats", label: "Project Chats", icon: MessageSquare },
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
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-slate-500/20 text-slate-400",
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

export default function OverviewPage() {
  const { accountId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("project-tasks");
  const [projects, setProjects] = useState<ProjectWithTaskCount[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [enquiries, setEnquiries] = useState<ClientLead[]>([]);
  const [enquirySearch, setEnquirySearch] = useState("");
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState<string>("all");
  const [loadingEnquiries, setLoadingEnquiries] = useState(false);
  const [enqSortField, setEnqSortField] = useState<EnqSortField>("next_follow_up_at");
  const [enqSortDir, setEnqSortDir] = useState<SortDir>("asc");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [productTasks, setProductTasks] = useState<ProductTask[]>([]);
  const [loadingProductTasks, setLoadingProductTasks] = useState(false);
  const [ptSearch, setPtSearch] = useState("");
  const [ptSortField, setPtSortField] = useState<PtSortField>("due_date");
  const [ptSortDir, setPtSortDir] = useState<SortDir>("asc");

  const [chatMessages, setChatMessages] = useState<ProjectChatMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);

  const [kanbanCards, setKanbanCards] = useState<KanbanCard[]>([]);
  const [loadingKanban, setLoadingKanban] = useState(false);

  // Load saved sort states
  useEffect(() => {
    const [ef, ed] = loadSort("enq", "next_follow_up_at");
    setEnqSortField(ef as EnqSortField); setEnqSortDir(ed);
    const [pf, pd] = loadSort("pt", "due_date");
    setPtSortField(pf as PtSortField); setPtSortDir(pd);
  }, []);

  const loadProjects = useCallback(async () => {
    if (!accountId) return;
    setLoadingProjects(true);
    try {
      const supabase = createClient();
      const { data: projectsData } = await supabase
        .from("projects").select("*").eq("account_id", accountId).order("name");
      if (!projectsData) { setLoadingProjects(false); return; }
      const { data: taskCounts } = await supabase
        .from("project_tasks").select("project_id").eq("account_id", accountId);
      const countMap: Record<string, number> = {};
      for (const t of taskCounts ?? []) countMap[t.project_id] = (countMap[t.project_id] ?? 0) + 1;
      setProjects(projectsData.map((p) => ({ ...p, task_count: countMap[p.id] ?? 0 })));
    } finally { setLoadingProjects(false); }
  }, [accountId]);

  const loadEnquiries = useCallback(async () => {
    if (!accountId) return;
    setLoadingEnquiries(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("client_leads")
        .select("id, title, status, priority, next_follow_up_at, created_at, phone")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
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

  const loadChats = useCallback(async () => {
    if (!accountId) return;
    setLoadingChats(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("project_chat_messages")
        .select("id, body, created_at, sender_user_id, project_id, project:projects(id,name), sender:profiles(full_name)")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(50);
      // Supabase returns join fields as arrays — normalise to single objects
      const msgs = ((data ?? []) as unknown[]).map((m: unknown) => {
        const msg = m as Record<string, unknown>;
        return {
          ...msg,
          project: Array.isArray(msg.project) ? (msg.project[0] ?? null) : msg.project,
          sender: Array.isArray(msg.sender) ? (msg.sender[0] ?? null) : msg.sender,
        } as unknown as ProjectChatMessage;
      });
      setChatMessages(msgs);
    } finally { setLoadingChats(false); }
  }, [accountId]);

  const loadKanban = useCallback(async () => {
    if (!accountId) return;
    setLoadingKanban(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("kanban_cards")
        .select("id, title, priority, due_date, board_id, stage_id, board:kanban_boards(id,name), stage:pipeline_stages(id,name)")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(100);
      const cards = ((data ?? []) as unknown[]).map((c: unknown) => {
        const card = c as Record<string, unknown>;
        return {
          ...card,
          board: Array.isArray(card.board) ? (card.board[0] ?? null) : card.board,
          stage: Array.isArray(card.stage) ? (card.stage[0] ?? null) : card.stage,
        } as unknown as KanbanCard;
      });
      setKanbanCards(cards);
    } finally { setLoadingKanban(false); }
  }, [accountId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => {
    if (activeTab === "enquiry-tasks") loadEnquiries();
    if (activeTab === "project-chats") loadChats();
    if (activeTab === "kanban") loadKanban();
    if (activeTab === "product-tasks") loadProductTasks();
  }, [activeTab, loadEnquiries, loadChats, loadKanban, loadProductTasks]);

  const activeProjects = projects.filter((p) => p.status === "active");
  const inactiveProjects = projects.filter((p) => p.status === "inactive");
  const archivedProjects = projects.filter((p) => p.status === "archived");
  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(projectSearch.toLowerCase()));

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

  const filteredEnquiries = enquiries
    .filter((e) => {
      if (enquirySearch && !e.title.toLowerCase().includes(enquirySearch.toLowerCase())) return false;
      if (enquiryStatusFilter !== "all" && e.status !== enquiryStatusFilter) return false;
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

  const filteredPt = productTasks
    .filter((t) => !ptSearch || t.title.toLowerCase().includes(ptSearch.toLowerCase()))
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

  async function handleEnqAction(id: string, status: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/client-leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast.error("Could not update"); return; }
      toast.success(`Marked as ${status.replace("_", " ")}`);
      loadEnquiries();
    } finally { setActionLoading(null); }
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

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0f1117]">
      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="mt-1 text-sm text-slate-400">Every task worth tracking — with the project roster always in view.</p>
        </div>

        {/* Tabs */}
        <div className="shrink-0 border-b border-[#2a3045] px-6">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
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

          {activeTab === "project-tasks" && <UnifiedTasksView />}

          {/* ── Enquiry Tasks ── */}
          {activeTab === "enquiry-tasks" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input type="text" placeholder="Search enquiries..." value={enquirySearch}
                  onChange={(e) => setEnquirySearch(e.target.value)}
                  className="flex-1 min-w-[180px] max-w-xs rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
                <select value={enquiryStatusFilter} onChange={(e) => setEnquiryStatusFilter(e.target.value)}
                  className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none">
                  <option value="all">All Status</option>
                  <option value="in_discussion">In Discussion</option>
                  <option value="hold">Hold</option>
                  <option value="confirmed">Converted</option>
                  <option value="rejected">Rejected</option>
                </select>
                <Link href="/client-leads"
                  className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600/20 px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-600/30 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Open Client Leads
                </Link>
              </div>

              {loadingEnquiries ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : filteredEnquiries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-16 gap-3 text-center">
                  <ClipboardList className="h-10 w-10 text-slate-600" />
                  <p className="text-sm text-slate-500">{enquirySearch || enquiryStatusFilter !== "all" ? "No enquiries match this filter." : "No enquiries yet."}</p>
                  <Link href="/client-leads" className="text-xs text-blue-400 hover:underline">Go to Client Leads →</Link>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#2a3045]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500 bg-[#1a1f2e]">
                        <SortTh label="Title" field="title" sortField={enqSortField} sortDir={enqSortDir} onSort={toggleEnqSort} />
                        <SortTh label="Status" field="status" sortField={enqSortField} sortDir={enqSortDir} onSort={toggleEnqSort} />
                        <SortTh label="Priority" field="priority" sortField={enqSortField} sortDir={enqSortDir} onSort={toggleEnqSort} />
                        <SortTh label="Next Follow-up" field="next_follow_up_at" sortField={enqSortField} sortDir={enqSortDir} onSort={toggleEnqSort} />
                        <th className="px-4 py-2.5 font-medium">Actions</th>
                        <th className="px-4 py-2.5 font-medium w-0" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEnquiries.map((e) => {
                        const isLoading = actionLoading === e.id;
                        return (
                          <tr key={e.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
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
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[e.priority] ?? "bg-slate-500/20 text-slate-400"}`}>
                                  {e.priority}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs">
                              {e.next_follow_up_at
                                ? new Date(e.next_follow_up_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                : <span className="text-slate-600">—</span>}
                            </td>
                            {/* 4 action buttons */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 flex-wrap">
                                <button type="button" disabled={isLoading} onClick={() => handleEnqAction(e.id, "hold")}
                                  title="Hold"
                                  className="flex items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors">
                                  <Clock className="h-3 w-3" /> Hold
                                </button>
                                <Link href={`/client-leads/${e.id}`}
                                  title="Move to Client Directory"
                                  className="flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400 hover:bg-green-500/20 transition-colors">
                                  <UserCheck className="h-3 w-3" /> Client Dir
                                </Link>
                                <button type="button" disabled={isLoading} onClick={() => handleEnqAction(e.id, "rejected")}
                                  title="Reject"
                                  className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors">
                                  <XCircle className="h-3 w-3" /> Reject
                                </button>
                                <button type="button" disabled={isLoading}
                                  onClick={() => {
                                    const future = new Date(); future.setDate(future.getDate() + 90);
                                    fetch(`/api/client-leads/${e.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ status: "hold", next_follow_up_at: future.toISOString() }),
                                    }).then((r) => { if (r.ok) { toast.success("Marked as future client"); loadEnquiries(); } else toast.error("Could not update"); });
                                  }}
                                  title="Future Client"
                                  className="flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors">
                                  <CheckCircle2 className="h-3 w-3" /> Future
                                </button>
                                {e.phone && (
                                  <a href={`https://wa.me/${e.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                                    title="Open WhatsApp"
                                    className="flex items-center gap-1 rounded border border-[#2a3045] px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-green-400 hover:border-green-500/30 transition-colors">
                                    <ArrowUpRight className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Link href={`/client-leads/${e.id}`} className="text-slate-500 hover:text-blue-400 transition-colors">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Product Tasks ── */}
          {activeTab === "product-tasks" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input type="text" placeholder="Search product tasks..." value={ptSearch}
                  onChange={(e) => setPtSearch(e.target.value)}
                  className="flex-1 min-w-[180px] max-w-xs rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
                <Link href="/product-tasks"
                  className="ml-auto flex items-center gap-1.5 rounded-lg bg-teal-600/20 px-3 py-1.5 text-sm font-medium text-teal-400 hover:bg-teal-600/30 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Manage Product Tasks
                </Link>
              </div>
              {loadingProductTasks ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                </div>
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
                        <SortTh label="Title" field="title" sortField={ptSortField} sortDir={ptSortDir} onSort={togglePtSort} />
                        <SortTh label="Priority" field="priority" sortField={ptSortField} sortDir={ptSortDir} onSort={togglePtSort} />
                        <SortTh label="Due Date" field="due_date" sortField={ptSortField} sortDir={ptSortDir} onSort={togglePtSort} />
                        <th className="px-4 py-2.5 font-medium">Product</th>
                        <th className="px-4 py-2.5 font-medium w-0" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPt.map((t) => {
                        const isOverdue = t.due_date && t.due_date < todayStr;
                        const isToday = t.due_date === todayStr;
                        return (
                          <tr key={t.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                            <td className="px-4 py-3 font-medium text-white">{t.title}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[t.priority] ?? "bg-slate-500/20 text-slate-400"}`}>
                                {t.priority}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {t.due_date ? (
                                <span className={isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-slate-400"}>
                                  {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{t.product?.name ?? "—"}</td>
                            <td className="px-4 py-3">
                              <Link href="/product-tasks" className="text-slate-500 hover:text-teal-400 transition-colors">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Kanban ── */}
          {activeTab === "kanban" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">Cards across all Kanban boards</p>
                <Link href="/kanban" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  Open Kanban <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {loadingKanban ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                </div>
              ) : kanbanCards.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-16 gap-3 text-center">
                  <Kanban className="h-10 w-10 text-slate-600" />
                  <p className="text-sm text-slate-500">No kanban cards yet.</p>
                  <Link href="/kanban" className="text-xs text-blue-400 hover:underline">Open Kanban Board →</Link>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#2a3045]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500 bg-[#1a1f2e]">
                        <th className="px-4 py-2.5 font-medium">Card</th>
                        <th className="px-4 py-2.5 font-medium">Board</th>
                        <th className="px-4 py-2.5 font-medium">Stage</th>
                        <th className="px-4 py-2.5 font-medium">Priority</th>
                        <th className="px-4 py-2.5 font-medium">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kanbanCards.map((card) => {
                        const isOverdue = card.due_date && card.due_date < todayStr;
                        const isToday = card.due_date === todayStr;
                        return (
                          <tr key={card.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                            <td className="px-4 py-3 font-medium text-white">{card.title}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">{card.board?.name ?? "—"}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">{card.stage?.name ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[card.priority] ?? "bg-slate-500/20 text-slate-400"}`}>
                                {card.priority}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {card.due_date ? (
                                <span className={isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-slate-400"}>
                                  {new Date(card.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Project Chats ── */}
          {activeTab === "project-chats" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">Recent messages across all project chats</p>
                <Link href="/projects" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  View all projects <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {loadingChats ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-16 gap-3 text-center">
                  <MessageSquare className="h-10 w-10 text-slate-600" />
                  <p className="text-sm text-slate-500">No project chat messages yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3 rounded-xl border border-[#2a3045] bg-[#1a1f2e] px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                        {(msg.sender?.full_name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-white">{msg.sender?.full_name ?? "Unknown"}</span>
                          {msg.project && (
                            <Link href={`/projects/${msg.project_id}`} className="text-[11px] text-blue-400 hover:underline">
                              #{msg.project.name}
                            </Link>
                          )}
                          <span className="ml-auto text-[11px] text-slate-500">{timeAgo(msg.created_at)}</span>
                        </div>
                        <p className="text-sm text-slate-300 line-clamp-2">{msg.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="w-72 shrink-0 border-l border-[#2a3045] bg-[#1a1f2e] flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 pt-5 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <Folder className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Projects</h2>
          </div>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 rounded-lg bg-[#0f1117] px-3 py-2 text-center">
              <p className="text-lg font-bold text-blue-400">{activeProjects.length}</p>
              <p className="text-[10px] text-slate-500">Active</p>
            </div>
            <div className="flex-1 rounded-lg bg-[#0f1117] px-3 py-2 text-center">
              <p className="text-lg font-bold text-slate-400">{inactiveProjects.length}</p>
              <p className="text-[10px] text-slate-500">Inactive</p>
            </div>
            <div className="flex-1 rounded-lg bg-[#0f1117] px-3 py-2 text-center">
              <p className="text-lg font-bold text-slate-500">{archivedProjects.length}</p>
              <p className="text-[10px] text-slate-500">Archived</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input type="text" placeholder="Search projects..." value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              className="w-full rounded-lg bg-[#0f1117] border border-[#2a3045] pl-8 pr-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loadingProjects ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <p className="text-center text-xs text-slate-600 py-6">
              {projectSearch ? "No projects match your search" : "No projects yet"}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredProjects.map((project, idx) => (
                <Link key={project.id} href={`/projects/${project.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-[#0f1117] transition-colors group">
                  <span className={`h-6 w-6 shrink-0 rounded ${getProjectColor(idx)} flex items-center justify-center text-[10px] font-bold text-white`}>
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate text-xs text-slate-300 group-hover:text-white">{project.name}</span>
                  {(project.task_count ?? 0) > 0 && (
                    <span className="shrink-0 text-[10px] font-medium text-slate-500">{project.task_count}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
