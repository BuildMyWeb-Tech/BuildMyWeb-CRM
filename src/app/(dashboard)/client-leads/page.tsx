"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  UserPlus, Plus, Loader2, MoreVertical, Pencil,
  List as ListIcon, LayoutGrid, Search, ArrowUpRight,
  PauseCircle, PlayCircle, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, ChevronsUpDown, AlertTriangle,
  FolderOpen, Info, Sparkles, Eye, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LeadFormDialog, TaskChecklist, FollowUpDialog,
  PRIORITIES, whatsappLink, formatFollowUp, followUpState,
  STATUS_LABEL,
} from "@/components/client-leads/lead-shared";
import type { ClientLead, LeadPriority, LeadStatus } from "@/types";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { useAccountMembers } from "@/hooks/use-account-members";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

async function fetchLeads(): Promise<ClientLead[]> {
  const res = await fetch("/api/client-leads");
  if (!res.ok) throw new Error("Could not load leads");
  return (await res.json()).leads ?? [];
}

type TabKey = "all" | "discussion" | "hold" | "converted" | "rejected";
type SortField = "title" | "priority" | "assignee" | "follow_up" | "status";
type SortDir = "asc" | "desc";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "discussion", label: "Discussion" },
  { key: "hold", label: "Hold" },
  { key: "converted", label: "Converted" },
  { key: "rejected", label: "Rejected" },
];

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400 border border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
};
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const STATUS_BADGE: Record<string, string> = {
  in_discussion: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  hold: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  confirmed: "bg-green-500/20 text-green-400 border border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
};
const STATUS_DISPLAY: Record<string, string> = {
  in_discussion: "Discussion",
  hold: "Hold",
  confirmed: "Converted",
  rejected: "Rejected",
};
const STATUS_ORDER: Record<LeadStatus, number> = { in_discussion: 0, hold: 1, confirmed: 2, rejected: 3 };

function ColHeader({
  field, label, sortField, sortDir, onSort,
}: {
  field: SortField; label: string; sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button type="button" onClick={() => onSort(field)}
      className="flex items-center gap-1 hover:text-slate-300 transition-colors whitespace-nowrap">
      {label}
      {active
        ? sortDir === "asc"
          ? <ChevronUp className="h-3 w-3 text-blue-400" />
          : <ChevronDown className="h-3 w-3 text-blue-400" />
        : <ChevronsUpDown className="h-3 w-3 text-slate-600" />}
    </button>
  );
}

export default function ClientLeadsPage() {
  const { accountId, user } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePagePermissions("client_leads");
  const { data: leads, refresh: load } = useCachedResource(
    accountId ? `client-leads-list:${accountId}` : null,
    fetchLeads,
  );
  const { members } = useAccountMembers();

  const [viewMode, setViewMode] = useState<"table" | "grid">(() => {
    try { return window.localStorage.getItem("cl-view") === "grid" ? "grid" : "table"; } catch { return "table"; }
  });
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | LeadPriority>(() => {
    try { return (window.localStorage.getItem("cl-priority") as LeadPriority) || "all"; } catch { return "all"; }
  });
  const [peopleFilter, setPeopleFilter] = useState<"all" | string>(() => {
    try { return window.localStorage.getItem("cl-person") || "all"; } catch { return "all"; }
  });
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientLead | null>(null);

  function changeViewMode(mode: "table" | "grid") {
    setViewMode(mode);
    try { window.localStorage.setItem("cl-view", mode); } catch {}
  }
  function setPriorityPersisted(v: "all" | LeadPriority) {
    setPriorityFilter(v);
    try { window.localStorage.setItem("cl-priority", v); } catch {}
  }
  function setPeoplePersisted(v: string) {
    setPeopleFilter(v);
    try { window.localStorage.setItem("cl-person", v); } catch {}
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const membersById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const allLeads = leads ?? [];

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: 0, discussion: 0, hold: 0, converted: 0, rejected: 0 };
    for (const lead of allLeads) {
      counts.all++;
      if (lead.status === "in_discussion") counts.discussion++;
      if (lead.status === "hold") counts.hold++;
      if (lead.status === "confirmed") counts.converted++;
      if (lead.status === "rejected") counts.rejected++;
    }
    return counts;
  }, [allLeads]);

  const stats = useMemo(() => ({
    total: allLeads.length,
    discussion: allLeads.filter((l) => l.status === "in_discussion").length,
    hold: allLeads.filter((l) => l.status === "hold").length,
    converted: allLeads.filter((l) => l.status === "confirmed").length,
    overdue: allLeads.filter((l) => l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date()).length,
  }), [allLeads]);

  function getAllocatedNames(lead: ClientLead) {
    return (lead.allocated_user_ids?.length ? lead.allocated_user_ids : lead.allocated_user_id ? [lead.allocated_user_id] : [])
      .map((id) => membersById.get(id)?.full_name).filter(Boolean).join(", ");
  }

  const visibleLeads = useMemo(() => allLeads
    .filter((lead) => {
      if (activeTab === "discussion" && lead.status !== "in_discussion") return false;
      if (activeTab === "hold" && lead.status !== "hold") return false;
      if (activeTab === "converted" && lead.status !== "confirmed") return false;
      if (activeTab === "rejected" && lead.status !== "rejected") return false;
      if (priorityFilter !== "all" && lead.priority !== priorityFilter) return false;
      if (peopleFilter !== "all") {
        const ids = lead.allocated_user_ids?.length ? lead.allocated_user_ids : lead.allocated_user_id ? [lead.allocated_user_id] : [];
        if (!ids.includes(peopleFilter)) return false;
      }
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!`${lead.title} ${lead.phone ?? ""} ${lead.notes ?? ""}`.toLowerCase().includes(q)) return false;
      }
      if (overdueOnly) {
        const fu = lead.next_follow_up_at ? new Date(lead.next_follow_up_at) : null;
        if (!fu || fu >= new Date()) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "priority") return dir * ((PRIORITY_ORDER[a.priority ?? "low"] ?? 9) - (PRIORITY_ORDER[b.priority ?? "low"] ?? 9));
      if (sortField === "status") return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      if (sortField === "title") return dir * a.title.localeCompare(b.title);
      if (sortField === "assignee") {
        const an = getAllocatedNames(a);
        const bn = getAllocatedNames(b);
        return dir * an.localeCompare(bn);
      }
      if (sortField === "follow_up") {
        if (!a.next_follow_up_at && !b.next_follow_up_at) return 0;
        if (!a.next_follow_up_at) return 1;
        if (!b.next_follow_up_at) return -1;
        return dir * a.next_follow_up_at.localeCompare(b.next_follow_up_at);
      }
      return 0;
    }), [allLeads, activeTab, priorityFilter, peopleFilter, statusFilter, search, overdueOnly, sortField, sortDir]);

  const isFiltered = priorityFilter !== "all" || peopleFilter !== "all" || statusFilter !== "all" || overdueOnly || search.trim() !== "" || activeTab !== "all";

  async function handleConfirm(lead: ClientLead) {
    if (!window.confirm(`Confirm "${lead.title}" as a client? This moves it into Client Directory.`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}/confirm`, { method: "POST" });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Could not confirm this lead."); return; }
    load(); toast.success(`"${lead.title}" moved to Client Directory.`);
  }

  async function handleReject(lead: ClientLead) {
    if (!window.confirm(`Reject "${lead.title}"? This deletes the lead.`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not reject this lead."); return; }
    load(); toast.success("Lead rejected and removed.");
  }

  async function handleMarkFuture(lead: ClientLead) {
    if (!window.confirm(`Move "${lead.title}" to Future Clients?`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}/future`, { method: "POST" });
    if (!res.ok) { toast.error("Could not move this lead."); return; }
    load(); toast.success(`"${lead.title}" moved to Future Clients.`);
  }

  async function handleToggleHold(lead: ClientLead) {
    const nextStatus: LeadStatus = lead.status === "hold" ? "in_discussion" : "hold";
    const res = await fetch(`/api/client-leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) { toast.error("Could not update status."); return; }
    load();
  }

  function openEdit(lead: ClientLead) { setEditTarget(lead); setFormOpen(true); }
  function openCreate() { setEditTarget(null); setFormOpen(true); }

  const statCards = [
    { label: "Total Enquiries", value: stats.total, color: "text-white" },
    { label: "In Discussion", value: stats.discussion, color: "text-blue-400" },
    { label: "On Hold", value: stats.hold, color: "text-yellow-400" },
    { label: "Converted", value: stats.converted, color: "text-green-400" },
  ];

  const statusGroups = [
    { key: "in_discussion", label: "Discussion" },
    { key: "hold", label: "Hold" },
    { key: "confirmed", label: "Converted" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <>
      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editTarget}
        members={members}
        onSaved={load}
      />

      <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] overflow-hidden bg-[#0f1117]">
        {/* ── Main content ── */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Header */}
          <div className="shrink-0 px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-blue-500/10 p-2">
                  <UserPlus className="h-5 w-5 text-blue-400" />
                </div>
                <h1 className="text-xl font-bold text-white sm:text-2xl">Client Enquiry</h1>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-[#2a3045] bg-[#1a1f2e] p-0.5">
                  <button type="button" onClick={() => changeViewMode("table")} aria-label="Table view"
                    className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${viewMode === "table" ? "bg-[#2a3045] text-white" : "text-slate-400 hover:text-white"}`}>
                    <ListIcon className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => changeViewMode("grid")} aria-label="Grid view"
                    className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${viewMode === "grid" ? "bg-[#2a3045] text-white" : "text-slate-400 hover:text-white"}`}>
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </div>
                {canCreate && (
                  <button type="button" onClick={openCreate}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
                    <Plus className="h-4 w-4" /> Add Enquiry
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-4 px-4 sm:px-6 pb-4">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
                <p className={`text-2xl font-bold ${card.color}`}>
                  {leads === null ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-white/10" /> : card.value}
                </p>
                <p className="text-xs text-slate-400 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Tab bar + count */}
          <div className="shrink-0 px-6 pb-0 flex items-end justify-between">
            <div className="flex items-center gap-1 border-b border-[#2a3045] overflow-x-auto">
              {TABS.map((tab) => (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                  className={`flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.key ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-white"}`}>
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.key ? "bg-blue-500/20 text-blue-400" : "bg-[#2a3045] text-slate-400"}`}>
                    {tabCounts[tab.key]}
                  </span>
                </button>
              ))}
            </div>
            {leads !== null && isFiltered && (
              <p className="text-xs text-slate-500 pb-3 shrink-0 pl-4">
                <span className="font-medium text-slate-300">{visibleLeads.length}</span> of {allLeads.length} — filtered
              </p>
            )}
          </div>

          {/* Filter bar */}
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-6 py-3 border-b border-[#2a3045]">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone..."
                className="border-[#2a3045] bg-[#1a1f2e] pl-9 text-white placeholder:text-slate-600 focus:border-blue-500 h-8 text-sm" />
            </div>
            <select value={priorityFilter} onChange={(e) => setPriorityPersisted(e.target.value as "all" | LeadPriority)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none">
              <option value="all">Priority: All</option>
              {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
            <select value={peopleFilter} onChange={(e) => setPeoplePersisted(e.target.value)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none">
              <option value="all">Assignee: All</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
            </select>
            <button type="button" onClick={() => setOverdueOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${overdueOnly ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-[#2a3045] bg-[#1a1f2e] text-slate-400 hover:text-white"}`}>
              <Calendar className="h-3.5 w-3.5" /> Overdue
            </button>
          </div>

          {/* Table / Grid */}
          <div className="flex-1 overflow-auto px-6 py-4">
            {leads === null ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            ) : visibleLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#2a3045] py-20 text-center">
                <UserPlus className="h-10 w-10 text-slate-700" />
                <p className="text-sm text-slate-500">{allLeads.length === 0 ? "No enquiries yet." : "Nothing matches this filter."}</p>
                {canCreate && allLeads.length === 0 && (
                  <button type="button" onClick={openCreate}
                    className="flex items-center gap-2 rounded-lg border border-[#2a3045] px-4 py-2 text-sm text-slate-300 hover:border-blue-500/50 transition-colors">
                    <Plus className="h-4 w-4" /> Add your first enquiry
                  </button>
                )}
              </div>
            ) : viewMode === "table" ? (
              <div className="overflow-x-auto rounded-xl border border-[#2a3045]">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3045] bg-[#1a1f2e] text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="w-10 px-4 py-3">
                        <input type="checkbox" className="h-4 w-4 rounded border-[#2a3045] bg-transparent accent-blue-500" />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="title" label="Client Name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="priority" label="Priority" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="assignee" label="Assigned To" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="follow_up" label="Next Follow Up" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeads.map((lead, idx) => {
                      const allocatedNames = getAllocatedNames(lead);
                      const fu = followUpState(lead.next_follow_up_at, lead.status);
                      const initials = getInitials(lead.title);
                      return (
                        <tr key={lead.id}
                          className={`border-b border-[#2a3045] last:border-0 transition-colors hover:bg-[#1a1f2e]`}>
                          <td className="px-4 py-3">
                            <input type="checkbox" className="h-4 w-4 rounded border-[#2a3045] bg-transparent accent-blue-500" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-400">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <Link href={`/client-leads/${lead.id}`}
                                  className="truncate text-sm font-medium text-white hover:text-blue-400 transition-colors block">
                                  {lead.title}
                                </Link>
                                {lead.phone && <p className="text-[11px] text-slate-500">{lead.phone}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_BADGE[lead.priority ?? ""] ?? "text-slate-400"}`}>
                              {lead.priority}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {allocatedNames || <span className="text-xs italic text-slate-600">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm ${fu === "overdue" ? "text-red-400 font-medium" : fu === "today" ? "text-green-400 font-medium" : "text-slate-400"}`}>
                              {lead.next_follow_up_at
                                ? formatFollowUp(lead.next_follow_up_at, lead.next_follow_up_has_time)
                                : <span className="italic text-slate-600">Not set</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[lead.status] ?? "text-slate-400"}`}>
                              {STATUS_DISPLAY[lead.status] ?? lead.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Link href={`/client-leads/${lead.id}`}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#2a3045] hover:text-white transition-colors">
                                <Eye className="h-3.5 w-3.5" />
                              </Link>
                              {canUpdate && (
                                <button type="button" onClick={() => openEdit(lead)}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#2a3045] hover:text-white transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#2a3045] hover:text-white transition-colors">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="border-[#2a3045] bg-[#1a1f2e]">
                                  {canUpdate && (
                                    <DropdownMenuItem onClick={() => handleToggleHold(lead)} className="text-slate-300 hover:bg-[#2a3045]">
                                      {lead.status === "hold" ? <><PlayCircle className="h-3.5 w-3.5" /> Resume Discussion</> : <><PauseCircle className="h-3.5 w-3.5" /> Put on Hold</>}
                                    </DropdownMenuItem>
                                  )}
                                  {canUpdate && (
                                    <DropdownMenuItem onClick={() => handleConfirm(lead)} className="text-green-400 hover:bg-[#2a3045]">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Client
                                    </DropdownMenuItem>
                                  )}
                                  {canUpdate && (
                                    <DropdownMenuItem onClick={() => handleMarkFuture(lead)} className="text-slate-300 hover:bg-[#2a3045]">
                                      <Sparkles className="h-3.5 w-3.5" /> Move to Future
                                    </DropdownMenuItem>
                                  )}
                                  {canDelete && (
                                    <DropdownMenuItem onClick={() => handleReject(lead)} className="text-red-400 hover:bg-[#2a3045]">
                                      <XCircle className="h-3.5 w-3.5" /> Reject
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-[#2a3045] px-4 py-3">
                  <p className="text-xs text-slate-500">
                    Showing {visibleLeads.length} of {allLeads.length} enquiries
                  </p>
                </div>
              </div>
            ) : (
              /* GRID VIEW */
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    allocatedNames={getAllocatedNames(lead)}
                    canUpdate={canUpdate}
                    canDelete={canDelete}
                    accountId={accountId}
                    userId={user?.id ?? null}
                    onEdit={() => openEdit(lead)}
                    onConfirm={() => handleConfirm(lead)}
                    onReject={() => handleReject(lead)}
                    onToggleHold={() => handleToggleHold(lead)}
                    onMarkFuture={() => handleMarkFuture(lead)}
                    onTasksChanged={load}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar — Status groups ── */}
        <div className="hidden lg:flex w-56 shrink-0 border-l border-[#2a3045] bg-[#1a1f2e] flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">By Status</h2>
            </div>

            {statusGroups.map((sg) => {
              const count = allLeads.filter((l) => l.status === sg.key).length;
              const isActive = statusFilter === sg.key;
              return (
                <button key={sg.key} type="button"
                  onClick={() => setStatusFilter(isActive ? "all" : sg.key)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 transition-colors text-left ${isActive ? "bg-blue-500/10 text-blue-300" : "hover:bg-[#0f1117] text-slate-300 hover:text-white"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${sg.key === "in_discussion" ? "bg-blue-400" : sg.key === "hold" ? "bg-yellow-400" : sg.key === "confirmed" ? "bg-green-400" : "bg-red-400"}`} />
                    <span className="text-xs">{sg.label}</span>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-slate-500">{count}</span>
                </button>
              );
            })}

            <div className="border-t border-[#2a3045] pt-3">
              <p className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">Quick stats</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs text-slate-500">Overdue</span>
                  <span className={`text-xs font-semibold ${stats.overdue > 0 ? "text-red-400" : "text-slate-500"}`}>{stats.overdue}</span>
                </div>
                <div className="flex items-center justify-between px-2">
                  <span className="text-xs text-slate-500">No follow-up</span>
                  <span className="text-xs font-semibold text-slate-400">
                    {allLeads.filter((l) => !l.next_follow_up_at && l.status === "in_discussion").length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Shared LeadCard (grid view) ──────────────────────────────────────────────
function LeadCard({
  lead, allocatedNames, canUpdate, canDelete,
  accountId, userId, onEdit, onConfirm, onReject, onToggleHold, onMarkFuture, onTasksChanged,
}: {
  lead: ClientLead; allocatedNames?: string;
  canUpdate: boolean; canDelete: boolean;
  accountId: string | null; userId: string | null;
  onEdit: () => void; onConfirm: () => void; onReject: () => void;
  onToggleHold: () => void; onMarkFuture: () => void; onTasksChanged: () => void;
}) {
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const fu = followUpState(lead.next_follow_up_at, lead.status);
  const overdue = fu === "overdue";
  const STATUS_BADGE_MAP: Record<string, string> = {
    in_discussion: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    hold: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    confirmed: "bg-green-500/20 text-green-400 border border-green-500/30",
    rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
  };
  const PRIORITY_BADGE_MAP: Record<string, string> = {
    urgent: "bg-red-500/20 text-red-400 border border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    low: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  };

  return (
    <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden"
      style={{ borderLeftColor: (lead.priority as string) === "urgent" ? "#ef4444" : (lead.priority as string) === "high" ? "#f97316" : (lead.priority as string) === "medium" ? "#eab308" : "#94a3b8", borderLeftWidth: 3 }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/client-leads/${lead.id}`} className="text-sm font-semibold text-white hover:text-blue-400 transition-colors line-clamp-2">
            {lead.title}
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_BADGE_MAP[lead.priority ?? ""] ?? ""}`}>{lead.priority}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE_MAP[lead.status] ?? ""}`}>{STATUS_LABEL[lead.status]}</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-[#2a3045] hover:text-white">
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-[#2a3045] bg-[#1a1f2e]">
                <DropdownMenuItem render={<Link href={`/client-leads/${lead.id}`} className="text-slate-300 focus:bg-[#2a3045]" />}>
                  <Info className="h-3.5 w-3.5" /> View full details
                </DropdownMenuItem>
                {canUpdate && <DropdownMenuItem onClick={onEdit} className="text-slate-300 hover:bg-[#2a3045]"><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
                {canUpdate && (
                  <DropdownMenuItem onClick={onToggleHold} className="text-slate-300 hover:bg-[#2a3045]">
                    {lead.status === "hold" ? <><PlayCircle className="h-3.5 w-3.5" /> Resume</> : <><PauseCircle className="h-3.5 w-3.5" /> Hold</>}
                  </DropdownMenuItem>
                )}
                {canUpdate && <DropdownMenuItem onClick={onConfirm} className="text-green-400 hover:bg-[#2a3045]"><CheckCircle2 className="h-3.5 w-3.5" /> Confirm Client</DropdownMenuItem>}
                {canUpdate && <DropdownMenuItem onClick={onMarkFuture} className="text-slate-300 hover:bg-[#2a3045]"><Sparkles className="h-3.5 w-3.5" /> Move to Future</DropdownMenuItem>}
                {canDelete && <DropdownMenuItem onClick={onReject} className="text-red-400 hover:bg-[#2a3045]"><XCircle className="h-3.5 w-3.5" /> Reject</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {lead.phone && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
            <span>{lead.phone}</span>
            <a href={whatsappLink(lead.phone)} target="_blank" rel="noopener noreferrer"
              className="flex h-5 w-5 items-center justify-center rounded text-green-500 hover:bg-green-500/10">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className={`text-xs ${overdue ? "text-red-400 font-medium" : "text-slate-500"}`}>
            {lead.next_follow_up_at ? formatFollowUp(lead.next_follow_up_at, lead.next_follow_up_has_time) : "No follow-up set"}
          </span>
          {allocatedNames && <span className="text-xs text-slate-500">{allocatedNames}</span>}
        </div>
      </div>
      {followUpOpen && (
        <FollowUpDialog open={followUpOpen} onOpenChange={setFollowUpOpen} leadId={lead.id} onSaved={onTasksChanged} />
      )}
    </div>
  );
}
