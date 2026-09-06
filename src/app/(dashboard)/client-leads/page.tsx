"use client";

import { useEffect, useMemo, useState } from "react";
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
  X,
  AlertTriangle,
  FolderOpen,
  ListTodo,
  Info,
  Check,
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
  PRIORITIES,
  PRIORITY_STYLE,
  STATUS_STYLE,
  STATUS_LABEL,
  SOURCES,
  SOURCE_LABEL,
  whatsappLink,
  formatFollowUp,
  isOverdue,
} from "@/components/client-leads/lead-shared";
import type { AccountMember, ClientLead, ClientLeadTask, LeadPriority, LeadSource, LeadStatus } from "@/types";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// Client Leads/Enquiry — everything that's still "in discussion",
// one stage before Client Directory. A lead here either gets
// Confirmed (copied into `clients`, then removed from this list),
// Rejected (deleted outright), or put on Hold (waiting, stays put).
// Distinct from Sales `contacts` (WhatsApp inbox leads) and from
// Client Directory (the confirmed relationship).
export default function ClientLeadsPage() {
  const { accountId, user } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePagePermissions("client_leads");
  const [leads, setLeads] = useState<ClientLead[] | null>(null);
  const [members, setMembers] = useState<AccountMember[]>([]);
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

  async function load() {
    const [leadsRes, membersRes] = await Promise.all([
      fetch("/api/client-leads"),
      fetch("/api/account/members"),
    ]);
    if (leadsRes.ok) setLeads((await leadsRes.json()).leads ?? []);
    if (membersRes.ok) setMembers((await membersRes.json()).members ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

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

  const visibleLeads = (leads ?? []).filter((lead) => {
    if (statusFilter === "in_discussion" && lead.status !== "in_discussion") return false;
    if (statusFilter === "hold" && lead.status !== "hold") return false;
    if (statusFilter === "all" && (lead.status === "confirmed" || lead.status === "rejected")) return false;
    if (priorityFilter !== "all" && lead.priority !== priorityFilter) return false;
    if (peopleFilter !== "all" && lead.allocated_user_id !== peopleFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = `${lead.title} ${lead.phone ?? ""} ${lead.notes ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

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
                  allocated={lead.allocated_user_id ? membersById.get(lead.allocated_user_id) : undefined}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                  accountId={accountId}
                  userId={user?.id ?? null}
                  onEdit={() => openEdit(lead)}
                  onConfirm={() => handleConfirm(lead)}
                  onReject={() => handleReject(lead)}
                  onToggleHold={() => handleToggleHold(lead)}
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

function AllTasksTab({
  groups,
  canEdit,
  onChanged,
}: {
  groups: { leadId: string; leadTitle: string; tasks: ClientLeadTask[] }[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState<{ leadId: string; taskId: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function toggle(leadId: string, task: ClientLeadTask) {
    const res = await fetch(`/api/client-leads/${leadId}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_done: !task.is_done }),
    });
    if (!res.ok) {
      toast.error("Could not update task.");
      return;
    }
    onChanged();
  }

  async function remove(leadId: string, task: ClientLeadTask) {
    const res = await fetch(`/api/client-leads/${leadId}/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete task.");
      return;
    }
    onChanged();
  }

  function startRename(leadId: string, task: ClientLeadTask) {
    setRenaming({ leadId, taskId: task.id });
    setRenameValue(task.title);
  }

  async function submitRename() {
    if (!renaming) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenaming(null);
      return;
    }
    const res = await fetch(`/api/client-leads/${renaming.leadId}/tasks/${renaming.taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    setRenaming(null);
    if (!res.ok) {
      toast.error("Could not rename task.");
      return;
    }
    onChanged();
  }

  if (groups.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm text-muted-foreground">No tasks across any enquiry yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.leadId} className="rounded-lg border border-border">
          <div className="border-b border-border bg-muted/40 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.leadTitle}</p>
          </div>
          <div className="divide-y divide-border">
            {group.tasks.map((task) => {
              const isRenaming = renaming?.leadId === group.leadId && renaming?.taskId === task.id;
              return (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => canEdit && toggle(group.leadId, task)}
                    disabled={!canEdit}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      task.is_done ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                    aria-label={task.is_done ? "Mark as not done" : "Mark as done"}
                  >
                    {task.is_done && <CheckCircle2 className="h-3 w-3" />}
                  </button>
                  {isRenaming ? (
                    <>
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        className="h-7 flex-1 border-border bg-muted text-sm text-foreground"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                      />
                      <button type="button" onClick={submitRename} className="shrink-0 text-emerald-500 hover:text-emerald-400" aria-label="Save">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className={`flex-1 truncate text-sm ${task.is_done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {task.title}
                    </span>
                  )}
                  {canEdit && !isRenaming && (
                    <>
                      <button
                        type="button"
                        onClick={() => startRename(group.leadId, task)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="Edit task title"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(group.leadId, task)}
                        className="shrink-0 text-muted-foreground hover:text-red-400"
                        aria-label="Delete task"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadCard({
  lead,
  allocated,
  canUpdate,
  canDelete,
  accountId,
  userId,
  onEdit,
  onConfirm,
  onReject,
  onToggleHold,
  onTasksChanged,
}: {
  lead: ClientLead;
  allocated?: AccountMember;
  canUpdate: boolean;
  canDelete: boolean;
  accountId: string | null;
  userId: string | null;
  onEdit: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onToggleHold: () => void;
  onTasksChanged: () => void;
}) {
  // Both default collapsed — keeps a grid of many enquiries compact,
  // and avoids mounting a full FileManager per visible card until
  // someone actually asks to see its documents.
  const [tasksOpen, setTasksOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const tasks = lead.tasks ?? [];
  const doneCount = tasks.filter((t) => t.is_done).length;
  const overdue = isOverdue(lead);

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
        <p className={`flex items-center gap-1 text-xs ${overdue ? "font-semibold text-red-400" : "text-muted-foreground"}`}>
          {overdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
          Next follow-up: {formatFollowUp(lead.next_follow_up_at)}
        </p>
        <p className="text-xs text-muted-foreground">
          Allocated to: {allocated?.full_name || <span className="italic">Unassigned</span>}
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
