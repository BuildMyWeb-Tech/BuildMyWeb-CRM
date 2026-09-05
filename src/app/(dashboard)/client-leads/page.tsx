"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import type { AccountMember, ClientLead, ClientLeadTask, LeadPriority, LeadSource, LeadStatus } from "@/types";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { toast } from "sonner";

const PRIORITIES: LeadPriority[] = ["high", "medium", "low"];
const PRIORITY_STYLE: Record<LeadPriority, string> = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-500",
  low: "bg-muted text-muted-foreground",
};
const STATUS_STYLE: Record<LeadStatus, string> = {
  in_discussion: "bg-primary/10 text-primary",
  hold: "bg-amber-500/15 text-amber-500",
  confirmed: "bg-emerald-500/15 text-emerald-500",
  rejected: "bg-red-500/15 text-red-400",
};
const STATUS_LABEL: Record<LeadStatus, string> = {
  in_discussion: "In Discussion",
  hold: "Hold",
  confirmed: "Confirmed",
  rejected: "Rejected",
};
const SOURCES: LeadSource[] = ["referral", "website", "cold_call", "social_media", "advertisement", "other"];
const SOURCE_LABEL: Record<LeadSource, string> = {
  referral: "Referral",
  website: "Website",
  cold_call: "Cold Call",
  social_media: "Social Media",
  advertisement: "Advertisement",
  other: "Other",
};

function whatsappLink(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return `https://wa.me/${digits}`;
}

function formatFollowUp(iso: string | null): string {
  if (!iso) return "No follow-up set";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Client Leads/Enquiry — everything that's still "in discussion",
// one stage before Client Directory. A lead here either gets
// Confirmed (copied into `clients`, then removed from this list),
// Rejected (deleted outright), or put on Hold (waiting, stays put).
// Distinct from Sales `contacts` (WhatsApp inbox leads) and from
// Client Directory (the confirmed relationship).
export default function ClientLeadsPage() {
  const { canCreate, canUpdate, canDelete } = usePagePermissions("client_leads");
  const [leads, setLeads] = useState<ClientLead[] | null>(null);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem("client-leads-view") === "list" ? "list" : "grid";
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_discussion" | "hold">("all");
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
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = `${lead.title} ${lead.phone ?? ""} ${lead.notes ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Client Leads/Enquiry</h1>
        </div>
        <div className="flex items-center gap-2">
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
        <div className={viewMode === "grid" ? "mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2" : "mt-6 flex flex-col gap-3"}>
          {visibleLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              allocated={lead.allocated_user_id ? membersById.get(lead.allocated_user_id) : undefined}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onEdit={() => openEdit(lead)}
              onConfirm={() => handleConfirm(lead)}
              onReject={() => handleReject(lead)}
              onToggleHold={() => handleToggleHold(lead)}
              onTasksChanged={load}
            />
          ))}
        </div>
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
  allocated,
  canUpdate,
  canDelete,
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
  onEdit: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onToggleHold: () => void;
  onTasksChanged: () => void;
}) {
  const [tasksOpen, setTasksOpen] = useState(false);
  const tasks = lead.tasks ?? [];
  const doneCount = tasks.filter((t) => t.is_done).length;

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
            {(canUpdate || canDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                  <MoreVertical className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
            )}
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
        <p className="text-xs text-muted-foreground">Next follow-up: {formatFollowUp(lead.next_follow_up_at)}</p>
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
      </CardContent>
    </Card>
  );
}

function TaskChecklist({
  leadId,
  tasks,
  canEdit,
  onChanged,
}: {
  leadId: string;
  tasks: ClientLeadTask[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/client-leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        toast.error("Could not add task.");
        return;
      }
      setNewTask("");
      onChanged();
    } finally {
      setAdding(false);
    }
  }

  async function toggleTask(task: ClientLeadTask) {
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

  async function deleteTask(task: ClientLeadTask) {
    const res = await fetch(`/api/client-leads/${leadId}/tasks/${task.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete task.");
      return;
    }
    onChanged();
  }

  return (
    <div className="mt-2 space-y-1.5">
      {tasks.length === 0 && <p className="text-xs text-muted-foreground">No tasks yet.</p>}
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => canEdit && toggleTask(task)}
            disabled={!canEdit}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              task.is_done ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
            aria-label={task.is_done ? "Mark as not done" : "Mark as done"}
          >
            {task.is_done && <CheckCircle2 className="h-3 w-3" />}
          </button>
          <span className={`flex-1 text-xs ${task.is_done ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {task.title}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => deleteTask(task)}
              className="text-muted-foreground hover:text-red-400"
              aria-label="Delete task"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <div className="flex items-center gap-1.5 pt-1">
          <Input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add a task…"
            className="h-7 border-border bg-muted text-xs text-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
            }}
          />
          <Button variant="outline" size="sm" onClick={addTask} disabled={adding || !newTask.trim()} className="h-7 shrink-0 px-2">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LeadFormDialog({
  open,
  onOpenChange,
  initial,
  members,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ClientLead | null;
  members: AccountMember[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<LeadPriority>("medium");
  const [source, setSource] = useState<string>("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [allocatedUserId, setAllocatedUserId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setPhone(initial?.phone ?? "");
    setNotes(initial?.notes ?? "");
    setPriority(initial?.priority ?? "medium");
    setSource(initial?.source ?? "");
    setNextFollowUp(toDatetimeLocal(initial?.next_follow_up_at ?? null));
    setAllocatedUserId(initial?.allocated_user_id ?? "");
  }, [open, initial]);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const payload = {
        title: trimmed,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        priority,
        source: source || null,
        next_follow_up_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
        allocated_user_id: allocatedUserId || null,
      };
      const res = await fetch(initial ? `/api/client-leads/${initial.id}` : "/api/client-leads", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not save this lead.");
        return;
      }
      onOpenChange(false);
      onSaved();
      toast.success(initial ? "Lead updated." : "Lead added.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{initial ? `Edit ${initial.title}` : "New lead"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Real Estate CRM"
              className="border-border bg-muted text-foreground"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Phone No</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 90000 00000"
              className="border-border bg-muted text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Priority</Label>
              <Select value={priority} onValueChange={(v) => v && setPriority(v as LeadPriority)}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Source</Label>
              <Select value={source || "__none"} onValueChange={(v) => setSource(v === "__none" ? "" : (v ?? ""))}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not set</SelectItem>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Allocated to</Label>
              <Select value={allocatedUserId || "__none"} onValueChange={(v) => setAllocatedUserId(v === "__none" ? "" : (v ?? ""))}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Next follow-up</Label>
            <Input
              type="datetime-local"
              value={nextFollowUp}
              onChange={(e) => setNextFollowUp(e.target.value)}
              className="border-border bg-muted text-foreground"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="border-border bg-muted text-foreground" rows={3} />
          </div>
          {!initial && (
            <p className="text-xs text-muted-foreground">
              Task checklist can be added after — expand &quot;Tasks&quot; on the card once it&apos;s created.
            </p>
          )}
        </div>
        <DialogFooter className="border-border bg-popover/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : initial ? "Save" : "Add lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
