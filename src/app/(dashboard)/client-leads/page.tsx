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
  ListTodo,
  Info,
  Sparkles,
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
  AllTasksTab,
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

// Client Leads/Enquiry — everything that's still "in discussion",
// one stage before Client Directory. A lead here either gets
// Confirmed (copied into `clients`, then removed from this list),
// Rejected (deleted outright), or put on Hold (waiting, stays put).
// Distinct from Sales `contacts` (WhatsApp inbox leads) and from
// Client Directory (the confirmed relationship).
export default function ClientLeadsPage() {
  const { accountId, user } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePagePermissions("client_leads");
  const { data: leads, refresh: load } = useCachedResource(
    accountId ? `client-leads-list:${accountId}` : null,
    fetchLeads,
  );
  const { members } = useAccountMembers();
  const [tab, setTab] = useState<"enquiries" | "tasks">("enquiries");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem("client-leads-view") === "list" ? "list" : "grid";
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_discussion" | "hold">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | LeadPriority>("all");
  const [peopleFilter, setPeopleFilter] = useState<"all" | string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientLead | null>(null);

  function changeViewMode(mode: "grid" | "list") {
    setViewMode(mode);
    window.localStorage.setItem("client-leads-view", mode);
  }

  const membersById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  // Lead source breakdown — which channel actually produces leads,
  // counted across every non-rejected lead (confirmed ones included,
  // since "which source converts" is the whole point of tracking it).
  const sourceBreakdown = useMemo(() => {
    const counts = new Map<LeadSource, number>();
    for (const lead of leads ?? []) {
      if (lead.status === "rejected" || !lead.source) continue;
      counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);
    }
    return SOURCES.map((s) => ({ source: s, count: counts.get(s) ?? 0 })).filter((s) => s.count > 0);
  }, [leads]);

  const STATUS_ORDER: Record<LeadStatus, number> = { in_discussion: 0, hold: 1, confirmed: 2, rejected: 3 };

  const visibleLeads = (leads ?? [])
    .filter((lead) => {
      if (statusFilter === "in_discussion" && lead.status !== "in_discussion") return false;
      if (statusFilter === "hold" && lead.status !== "hold") return false;
      if (statusFilter === "all" && (lead.status === "confirmed" || lead.status === "rejected")) return false;
      if (priorityFilter !== "all" && lead.priority !== priorityFilter) return false;
      if (peopleFilter !== "all" && !(lead.allocated_user_ids?.length ? lead.allocated_user_ids : lead.allocated_user_id ? [lead.allocated_user_id] : []).includes(peopleFilter)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${lead.title} ${lead.phone ?? ""} ${lead.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    // In Discussion first, then Hold (then anything else, for the "all" filter's stray states) —
    // matches the same grouping used on the Enquiry Tasks tab.
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  // Grouped by lead — the "All Tasks" tab. Grouping (instead of one
  // flat list with no context) is what makes a shared title like
  // "Follow up" understandable at a glance; still no other enquiry
  // metadata per the original ask, just the group header.
  const taskGroups = (leads ?? [])
    .filter((l) => l.status !== "rejected" && (l.tasks ?? []).length > 0)
    .map((lead) => ({ leadId: lead.id, leadTitle: lead.title, tasks: lead.tasks ?? [] }));

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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Client Enquiry</h1>
        </div>
        <div className="flex items-center gap-2">
          {tab === "enquiries" && (
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => changeViewMode("grid")}
                aria-label="Grid view"
                aria-pressed={viewMode === "grid"}
                className={`flex h-7 w-8 items-center justify-center rounded-md ${
                  viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => changeViewMode("list")}
                aria-label="List view"
                aria-pressed={viewMode === "list"}
                className={`flex h-7 w-8 items-center justify-center rounded-md ${
                  viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New lead
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Still in discussion — confirm to move a lead into Client Directory, reject to remove it, or hold while it waits.
      </p>

      <div className="mt-4 flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("enquiries")}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "enquiries" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Enquiries
        </button>
        <button
          type="button"
          onClick={() => setTab("tasks")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "tasks" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ListTodo className="h-3.5 w-3.5" />
          All Tasks
        </button>
      </div>

      {tab === "tasks" ? (
        <AllTasksTab groups={taskGroups} canEdit={canUpdate} onChanged={load} />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, phone, notes…"
                className="border-border bg-muted pl-8 text-foreground"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["in_discussion", "In Discussion"],
                  ["hold", "Hold"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Select value={priorityFilter} onValueChange={(v) => v && setPriorityFilter(v as "all" | LeadPriority)}>
              <SelectTrigger size="sm">
                <SelectValue className="truncate">
                  {(v: string) => (v === "all" ? "Priority: All" : `Priority: ${v.charAt(0).toUpperCase()}${v.slice(1)}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value="all">Priority: All</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={peopleFilter} onValueChange={(v) => v && setPeopleFilter(v)}>
              <SelectTrigger size="sm">
                <SelectValue className="truncate">
                  {(v: string) => (v === "all" ? "People: All" : `People: ${members.find((m) => m.user_id === v)?.full_name ?? "Unknown"}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value="all">People: All</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sourceBreakdown.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">By source:</span>
              {sourceBreakdown.map(({ source, count }) => (
                <span key={source} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {SOURCE_LABEL[source]} · {count}
                </span>
              ))}
            </div>
          )}

          {leads === null ? (
            <div className="mt-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visibleLeads.length === 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {leads.length === 0 ? "No leads yet." : "Nothing matches this filter."}
              </p>
              {canCreate && leads.length === 0 && (
                <Button variant="outline" size="sm" onClick={openCreate}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add your first lead
                </Button>
              )}
            </div>
          ) : (
            <div className={viewMode === "grid" ? "mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "mt-6 flex flex-col gap-3"}>
              {visibleLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  allocatedNames={(lead.allocated_user_ids?.length ? lead.allocated_user_ids : lead.allocated_user_id ? [lead.allocated_user_id] : [])
                    .map((id) => membersById.get(id)?.full_name)
                    .filter(Boolean)
                    .join(", ")}
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
        </>
      )}

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
  // Both default collapsed — keeps a grid of many enquiries compact,
  // and avoids mounting a full FileManager per visible card until
  // someone actually asks to see its documents.
  const [tasksOpen, setTasksOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const tasks = lead.tasks ?? [];
  const doneCount = tasks.filter((t) => t.is_done).length;
  const fu = followUpState(lead.next_follow_up_at, lead.status);
  const overdue = fu === "overdue";

  return (
    <Card className="border-l-4" style={{ borderLeftColor: lead.priority === "high" ? "#ef4444" : lead.priority === "medium" ? "#f59e0b" : "#94a3b8" }}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{lead.title}</CardTitle>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[lead.priority]}`}>
              {lead.priority}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[lead.status]}`}>
              {STATUS_LABEL[lead.status]}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  render={<Link href={`/client-leads/${lead.id}`} className="text-popover-foreground focus:bg-accent focus:text-accent-foreground" />}
                >
                  <Info className="h-3.5 w-3.5" />
                  View full details
                </DropdownMenuItem>
                {canUpdate && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canUpdate && (
                  <DropdownMenuItem onClick={onToggleHold}>
                    {lead.status === "hold" ? (
                      <>
                        <PlayCircle className="h-3.5 w-3.5" />
                        Resume (back to In Discussion)
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
                  <DropdownMenuItem onClick={onConfirm} className="text-emerald-500 focus:text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirm → Client Directory
                  </DropdownMenuItem>
                )}
                {canUpdate && (
                  <DropdownMenuItem onClick={onMarkFuture}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Move to Future Clients
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem onClick={onReject} className="text-red-400 focus:text-red-400">
                    <XCircle className="h-3.5 w-3.5" />
                    Reject (delete)
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <span>{lead.phone}</span>
            <a
              href={whatsappLink(lead.phone)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in WhatsApp"
              className="flex h-5 w-5 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
        {lead.notes && <p className="line-clamp-2 text-xs text-muted-foreground">{lead.notes}</p>}
        {lead.source && (
          <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {SOURCE_LABEL[lead.source]}
          </span>
        )}
        <div
          className={`flex items-center justify-between gap-1 text-xs ${
            fu === "overdue" ? "font-semibold text-red-400" : fu === "today" ? "font-semibold text-emerald-500" : "text-muted-foreground"
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
        <p className="text-xs text-muted-foreground">
          Allocated to: {allocatedNames || <span className="italic">Unassigned</span>}
        </p>

        <div className="border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setTasksOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {tasksOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Tasks ({doneCount}/{tasks.length})
          </button>
          {tasksOpen && (
            <TaskChecklist leadId={lead.id} tasks={tasks} canEdit={canUpdate} onChanged={onTasksChanged} />
          )}
        </div>

        <div className="border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setDocsOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
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
      </CardContent>
    </Card>
  );
}
