"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  UserPlus,
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  List as ListIcon,
  LayoutGrid,
  Search,
  ArrowUpRight,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FolderOpen,
  Info,
  Sparkles,
  Eye,
  TrendingUp,
  TrendingDown,
  Filter,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileManager } from "@/components/files/file-manager";
import {
  LeadFormDialog,
  TaskChecklist,
  FollowUpDialog,
  PRIORITIES,
  PRIORITY_STYLE,
  STATUS_STYLE,
  STATUS_LABEL,
  SOURCES,
  SOURCE_LABEL,
  whatsappLink,
  formatFollowUp,
  followUpState,
} from "@/components/client-leads/lead-shared";
import type { ClientLead, LeadPriority, LeadSource, LeadStatus } from "@/types";
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

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "discussion", label: "Discussion" },
  { key: "hold", label: "Hold" },
  { key: "converted", label: "Converted" },
  { key: "rejected", label: "Rejected" },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400 border border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
};

const MODE_BADGE: Record<string, string> = {
  in_discussion: "bg-teal-500/20 text-teal-400 border border-teal-500/30",
  hold: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  confirmed: "bg-green-500/20 text-green-400 border border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
};

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

export default function ClientLeadsPage() {
  const { accountId, user } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePagePermissions("client_leads");
  const { data: leads, refresh: load } = useCachedResource(
    accountId ? `client-leads-list:${accountId}` : null,
    fetchLeads,
  );
  const { members } = useAccountMembers();
  const [viewMode, setViewMode] = useState<"table" | "grid">(() => {
    if (typeof window === "undefined") return "table";
    return window.localStorage.getItem("client-leads-view") === "grid" ? "grid" : "table";
  });
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | LeadPriority>("all");
  const [peopleFilter, setPeopleFilter] = useState<"all" | string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientLead | null>(null);

  function changeViewMode(mode: "table" | "grid") {
    setViewMode(mode);
    window.localStorage.setItem("client-leads-view", mode);
  }

  const membersById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const allLeads = leads ?? [];

  // Tab counts
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

  // Stat card counts
  const stats = useMemo(() => {
    const total = allLeads.length;
    const discussion = allLeads.filter((l) => l.status === "in_discussion").length;
    const hold = allLeads.filter((l) => l.status === "hold").length;
    const converted = allLeads.filter((l) => l.status === "confirmed").length;
    return { total, discussion, hold, converted };
  }, [allLeads]);

  const STATUS_ORDER: Record<LeadStatus, number> = { in_discussion: 0, hold: 1, confirmed: 2, rejected: 3 };

  const visibleLeads = allLeads
    .filter((lead) => {
      // Tab filter
      if (activeTab === "discussion" && lead.status !== "in_discussion") return false;
      if (activeTab === "hold" && lead.status !== "hold") return false;
      if (activeTab === "converted" && lead.status !== "confirmed") return false;
      if (activeTab === "rejected" && lead.status !== "rejected") return false;

      // Other filters
      if (priorityFilter !== "all" && lead.priority !== priorityFilter) return false;
      if (peopleFilter !== "all" && !(lead.allocated_user_ids?.length ? lead.allocated_user_ids : lead.allocated_user_id ? [lead.allocated_user_id] : []).includes(peopleFilter)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${lead.title} ${lead.phone ?? ""} ${lead.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  async function handleConfirm(lead: ClientLead) {
    if (!window.confirm(`Confirm "${lead.title}" as a client? This moves it into Client Directory.`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}/confirm`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? "Could not confirm this lead.");
      return;
    }
    load();
    toast.success(`"${lead.title}" moved to Client Directory.`);
  }

  async function handleReject(lead: ClientLead) {
    if (!window.confirm(`Reject "${lead.title}"? This deletes the lead — this can't be undone.`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not reject this lead.");
      return;
    }
    load();
    toast.success("Lead rejected and removed.");
  }

  async function handleMarkFuture(lead: ClientLead) {
    if (!window.confirm(`Move "${lead.title}" to Future Clients? It'll be removed from this list.`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}/future`, { method: "POST" });
    if (!res.ok) {
      toast.error("Could not move this lead.");
      return;
    }
    load();
    toast.success(`"${lead.title}" moved to Future Clients.`);
  }

  async function handleToggleHold(lead: ClientLead) {
    const nextStatus: LeadStatus = lead.status === "hold" ? "in_discussion" : "hold";
    const res = await fetch(`/api/client-leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      toast.error("Could not update status.");
      return;
    }
    load();
  }

  function openEdit(lead: ClientLead) {
    setEditTarget(lead);
    setFormOpen(true);
  }

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function getAllocatedNames(lead: ClientLead) {
    return (lead.allocated_user_ids?.length ? lead.allocated_user_ids : lead.allocated_user_id ? [lead.allocated_user_id] : [])
      .map((id) => membersById.get(id)?.full_name)
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="space-y-6 p-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20">
                <UserPlus className="h-5 w-5 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Client Enquiry</h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Track and manage all client enquiries from new leads to conversion.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-[#2a3045] bg-[#1a1f2e] p-0.5">
              <button
                type="button"
                onClick={() => changeViewMode("table")}
                aria-label="Table view"
                aria-pressed={viewMode === "table"}
                className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                  viewMode === "table" ? "bg-[#2a3045] text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => changeViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                  viewMode === "grid" ? "bg-[#2a3045] text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
            {canCreate && (
              <Button
                onClick={openCreate}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Enquiry
              </Button>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                <UserPlus className="h-5 w-5 text-blue-400" />
              </div>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <TrendingUp className="h-3 w-3" /> +12%
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-sm text-slate-400">Total Enquiries</p>
            <p className="mt-0.5 text-xs text-slate-500">+12% this month</p>
          </div>
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
                <AlertTriangle className="h-5 w-5 text-orange-400" />
              </div>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <TrendingUp className="h-3 w-3" /> +33%
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">
              {allLeads.filter((l) => l.status === "in_discussion" && !l.next_follow_up_at).length}
            </p>
            <p className="text-sm text-slate-400">New Enquiries</p>
            <p className="mt-0.5 text-xs text-slate-500">+33% this month</p>
          </div>
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                <Info className="h-5 w-5 text-purple-400" />
              </div>
              <span className="flex items-center gap-1 text-xs text-red-400">
                <TrendingDown className="h-3 w-3" /> -5%
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{stats.discussion}</p>
            <p className="text-sm text-slate-400">In Discussion</p>
            <p className="mt-0.5 text-xs text-slate-500">-5% this month</p>
          </div>
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <TrendingUp className="h-3 w-3" /> +2%
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{stats.converted}</p>
            <p className="text-sm text-slate-400">Converted</p>
            <p className="mt-0.5 text-xs text-slate-500">+2% this month</p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search enquiries by client, phone, email..."
              className="border-[#2a3045] bg-[#1a1f2e] pl-9 text-white placeholder:text-slate-500 focus:border-blue-500"
            />
          </div>

          <Select value={priorityFilter} onValueChange={(v) => v && setPriorityFilter(v as "all" | LeadPriority)}>
            <SelectTrigger className="w-36 border-[#2a3045] bg-[#1a1f2e] text-slate-300">
              <SelectValue>
                {(v: string) => (v === "all" ? "Priority: All" : `Priority: ${v.charAt(0).toUpperCase()}${v.slice(1)}`)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Priority: All</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={peopleFilter} onValueChange={(v) => v && setPeopleFilter(v)}>
            <SelectTrigger className="w-40 border-[#2a3045] bg-[#1a1f2e] text-slate-300">
              <SelectValue>
                {(v: string) => (v === "all" ? "Assignee: All" : `${members.find((m) => m.user_id === v)?.full_name ?? "Unknown"}`)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Assignee: All</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <Filter className="h-4 w-4" />
            More Filters
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-[#2a3045] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "border-blue-500 text-white"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                activeTab === tab.key ? "bg-blue-500/20 text-blue-400" : "bg-[#2a3045] text-slate-400"
              }`}>
                {tabCounts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {leads === null ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : visibleLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#2a3045] py-20 text-center">
            <UserPlus className="h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-400">
              {allLeads.length === 0 ? "No enquiries yet." : "Nothing matches this filter."}
            </p>
            {canCreate && allLeads.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={openCreate}
                className="border-[#2a3045] text-slate-300 hover:bg-[#2a3045] hover:text-white"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add your first enquiry
              </Button>
            )}
          </div>
        ) : viewMode === "table" ? (
          /* TABLE VIEW */
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3045] bg-[#1e2436]">
                    <th className="w-10 px-4 py-3 text-left">
                      <input type="checkbox" className="h-4 w-4 rounded border-[#2a3045] bg-transparent accent-blue-500" />
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Client Name
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Enquiry Title
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Mode
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Assigned To
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Next Follow Up
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLeads.map((lead, idx) => {
                    const allocatedNames = getAllocatedNames(lead);
                    const fu = followUpState(lead.next_follow_up_at, lead.status);
                    const initials = getInitials(lead.title);
                    return (
                      <tr
                        key={lead.id}
                        className={`border-b border-[#2a3045] transition-colors hover:bg-[#1e2436] ${
                          idx === visibleLeads.length - 1 ? "border-b-0" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input type="checkbox" className="h-4 w-4 rounded border-[#2a3045] bg-transparent accent-blue-500" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-400">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/client-leads/${lead.id}`}
                                className="truncate text-sm font-medium text-white hover:text-blue-400 transition-colors"
                              >
                                {lead.title}
                              </Link>
                              {lead.phone && (
                                <p className="text-[11px] text-slate-500">{lead.phone}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="max-w-[180px] truncate text-slate-300">
                            {lead.notes ? lead.notes.slice(0, 60) : lead.title}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${PRIORITY_BADGE[lead.priority] ?? "text-slate-400"}`}>
                            {lead.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${MODE_BADGE[lead.status] ?? "text-slate-400"}`}>
                            {STATUS_DISPLAY[lead.status] ?? lead.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {allocatedNames ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-400">
                                {getInitials(allocatedNames)}
                              </div>
                              <span className="text-sm text-slate-300 truncate max-w-[100px]">{allocatedNames}</span>
                            </div>
                          ) : (
                            <span className="text-xs italic text-slate-600">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm ${fu === "overdue" ? "text-red-400 font-medium" : fu === "today" ? "text-green-400 font-medium" : "text-slate-400"}`}>
                            {lead.next_follow_up_at
                              ? formatFollowUp(lead.next_follow_up_at, lead.next_follow_up_has_time)
                              : <span className="italic text-slate-600">Not set</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[lead.status] ?? "text-slate-400"}`}>
                            {STATUS_DISPLAY[lead.status] ?? lead.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/client-leads/${lead.id}`}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#2a3045] hover:text-white transition-colors"
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            {canUpdate && (
                              <button
                                type="button"
                                onClick={() => openEdit(lead)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#2a3045] hover:text-white transition-colors"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-[#2a3045] hover:text-white transition-colors">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="border-[#2a3045] bg-[#1a1f2e]">
                                {canUpdate && (
                                  <DropdownMenuItem
                                    onClick={() => handleToggleHold(lead)}
                                    className="text-slate-300 hover:bg-[#2a3045]"
                                  >
                                    {lead.status === "hold" ? (
                                      <>
                                        <PlayCircle className="h-3.5 w-3.5" />
                                        Resume Discussion
                                      </>
                                    ) : (
                                      <>
                                        <PauseCircle className="h-3.5 w-3.5" />
                                        Put on Hold
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                )}
                                {canUpdate && (
                                  <DropdownMenuItem
                                    onClick={() => handleConfirm(lead)}
                                    className="text-green-400 hover:bg-[#2a3045]"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Confirm Client
                                  </DropdownMenuItem>
                                )}
                                {canUpdate && (
                                  <DropdownMenuItem
                                    onClick={() => handleMarkFuture(lead)}
                                    className="text-slate-300 hover:bg-[#2a3045]"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Move to Future
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem
                                    onClick={() => handleReject(lead)}
                                    className="text-red-400 hover:bg-[#2a3045]"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Reject
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
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-[#2a3045] px-4 py-3">
              <p className="text-xs text-slate-500">
                Showing 1 to {visibleLeads.length} of {visibleLeads.length} enquiries
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg border border-[#2a3045] px-2.5 py-1 text-xs text-slate-400 hover:bg-[#2a3045] hover:text-white transition-colors"
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs text-white"
                >
                  1
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[#2a3045] px-2.5 py-1 text-xs text-slate-400 hover:bg-[#2a3045] hover:text-white transition-colors"
                >
                  Next
                </button>
              </div>
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

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editTarget}
        members={members}
        onSaved={load}
      />
    </div>
  );
}

function LeadCard({
  lead,
  allocatedNames,
  canUpdate,
  canDelete,
  accountId,
  userId,
  onEdit,
  onConfirm,
  onReject,
  onToggleHold,
  onMarkFuture,
  onTasksChanged,
}: {
  lead: ClientLead;
  allocatedNames?: string;
  canUpdate: boolean;
  canDelete: boolean;
  accountId: string | null;
  userId: string | null;
  onEdit: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onToggleHold: () => void;
  onMarkFuture: () => void;
  onTasksChanged: () => void;
}) {
  const [tasksOpen, setTasksOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const tasks = lead.tasks ?? [];
  const doneCount = tasks.filter((t) => t.is_done).length;
  const fu = followUpState(lead.next_follow_up_at, lead.status);
  const overdue = fu === "overdue";

  return (
    <div
      className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] overflow-hidden"
      style={{ borderLeftColor: lead.priority === "urgent" ? "#ef4444" : lead.priority === "high" ? "#f97316" : lead.priority === "medium" ? "#eab308" : "#94a3b8", borderLeftWidth: 3 }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/client-leads/${lead.id}`}
            className="text-sm font-semibold text-white hover:text-blue-400 transition-colors line-clamp-2"
          >
            {lead.title}
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_BADGE[lead.priority]}`}>
              {lead.priority}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[lead.status]}`}>
              {STATUS_LABEL[lead.status]}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-[#2a3045] hover:text-white">
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-[#2a3045] bg-[#1a1f2e]">
                <DropdownMenuItem
                  render={<Link href={`/client-leads/${lead.id}`} className="text-slate-300 focus:bg-[#2a3045]" />}
                >
                  <Info className="h-3.5 w-3.5" />
                  View full details
                </DropdownMenuItem>
                {canUpdate && (
                  <DropdownMenuItem onClick={onEdit} className="text-slate-300 hover:bg-[#2a3045]">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canUpdate && (
                  <DropdownMenuItem onClick={onToggleHold} className="text-slate-300 hover:bg-[#2a3045]">
                    {lead.status === "hold" ? (
                      <>
                        <PlayCircle className="h-3.5 w-3.5" />
                        Resume Discussion
                      </>
                    ) : (
                      <>
                        <PauseCircle className="h-3.5 w-3.5" />
                        Put on hold
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {canUpdate && (
                  <DropdownMenuItem onClick={onConfirm} className="text-green-400 hover:bg-[#2a3045]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirm Client
                  </DropdownMenuItem>
                )}
                {canUpdate && (
                  <DropdownMenuItem onClick={onMarkFuture} className="text-slate-300 hover:bg-[#2a3045]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Move to Future Clients
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem onClick={onReject} className="text-red-400 hover:bg-[#2a3045]">
                    <XCircle className="h-3.5 w-3.5" />
                    Reject (delete)
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {lead.phone && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
            <span>{lead.phone}</span>
            <a
              href={whatsappLink(lead.phone)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in WhatsApp"
              className="flex h-5 w-5 items-center justify-center rounded text-green-500 hover:bg-green-500/10"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
        {lead.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{lead.notes}</p>}
        {lead.source && (
          <span className="mt-1 inline-block rounded-full bg-[#2a3045] px-2 py-0.5 text-[10px] font-medium text-slate-400">
            {SOURCE_LABEL[lead.source]}
          </span>
        )}
        <div
          className={`mt-2 flex items-center justify-between gap-1 text-xs ${
            fu === "overdue" ? "font-semibold text-red-400" : fu === "today" ? "font-semibold text-green-400" : "text-slate-500"
          }`}
        >
          <span className="flex items-center gap-1">
            {overdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            Next follow-up: {formatFollowUp(lead.next_follow_up_at, lead.next_follow_up_has_time)}
          </span>
          {overdue && canUpdate && (
            <button
              type="button"
              onClick={() => setFollowUpOpen(true)}
              className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/25"
            >
              Mark done
            </button>
          )}
        </div>
        <FollowUpDialog open={followUpOpen} onOpenChange={setFollowUpOpen} leadId={lead.id} onSaved={onTasksChanged} />
        <p className="mt-1 text-xs text-slate-500">
          Assigned to: {allocatedNames || <span className="italic">Unassigned</span>}
        </p>

        <div className="mt-3 border-t border-[#2a3045] pt-2">
          <button
            type="button"
            onClick={() => setTasksOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-white transition-colors"
          >
            {tasksOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Tasks ({doneCount}/{tasks.length})
          </button>
          {tasksOpen && (
            <TaskChecklist leadId={lead.id} tasks={tasks} canEdit={canUpdate} onChanged={onTasksChanged} />
          )}
        </div>

        <div className="mt-2 border-t border-[#2a3045] pt-2">
          <button
            type="button"
            onClick={() => setDocsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-white transition-colors"
          >
            {docsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <FolderOpen className="h-3.5 w-3.5" />
            Documents
          </button>
          {docsOpen && accountId && userId && (
            <div className="mt-2">
              <FileManager accountId={accountId} userId={userId} projectId={null} leadId={lead.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
