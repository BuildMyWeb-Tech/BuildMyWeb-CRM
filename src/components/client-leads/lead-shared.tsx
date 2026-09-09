"use client";

import { useEffect, useState } from "react";
import { Plus, X, Pencil, Check, ArrowUpRight, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import type { AccountMember, ClientLead, ClientLeadTask, LeadPriority, LeadSource, LeadStatus } from "@/types";
import { toast } from "sonner";

// Shared between the Client Enquiry list page and its detail page
// (/client-leads/[id]) — constants, small formatters, and the two
// dialogs/panels both surfaces need, kept in one place so they can't
// drift apart.

export const PRIORITIES: LeadPriority[] = ["high", "medium", "low"];
export const PRIORITY_STYLE: Record<LeadPriority, string> = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-500",
  low: "bg-muted text-muted-foreground",
};
export const STATUS_STYLE: Record<LeadStatus, string> = {
  in_discussion: "bg-primary/10 text-primary",
  hold: "bg-amber-500/15 text-amber-500",
  confirmed: "bg-emerald-500/15 text-emerald-500",
  rejected: "bg-red-500/15 text-red-400",
};
export const STATUS_LABEL: Record<LeadStatus, string> = {
  in_discussion: "In Discussion",
  hold: "Hold",
  confirmed: "Confirmed",
  rejected: "Rejected",
};
export const SOURCES: LeadSource[] = ["referral", "website", "cold_call", "social_media", "advertisement", "other"];
export const SOURCE_LABEL: Record<LeadSource, string> = {
  referral: "Referral",
  website: "Website",
  cold_call: "Cold Call",
  social_media: "Social Media",
  advertisement: "Advertisement",
  other: "Other",
};

export function whatsappLink(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return `https://wa.me/${digits}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// "20th Sep 2026 at 5:18 PM" — with the "at ..." clause dropped
// entirely for a date-only follow-up (hasTime === false).
export function formatFollowUp(iso: string | null, hasTime: boolean = true): string {
  if (!iso) return "No follow-up set";
  const d = new Date(iso);
  const datePart = `${ordinal(d.getDate())} ${d.toLocaleString(undefined, { month: "short" })} ${d.getFullYear()}`;
  if (!hasTime) return datePart;
  const timePart = d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart} at ${timePart}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export type FollowUpState = "none" | "overdue" | "today" | "normal";

// Comparison is by calendar day, not exact timestamp, for both
// date-only AND date+time follow-ups — a same-day follow-up isn't
// "overdue" just because the clock time already passed, and only
// "active" leads (still being worked) can be overdue at all — a held
// or already-decided lead's date isn't a live deadline anymore.
export function followUpState(iso: string | null, status: LeadStatus): FollowUpState {
  if (!iso) return "none";
  if (status !== "in_discussion" && status !== "hold") return "none";
  const followDay = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  if (followDay < today) return "overdue";
  if (followDay === today) return "today";
  return "normal";
}

export function isOverdue(lead: ClientLead): boolean {
  return followUpState(lead.next_follow_up_at, lead.status) === "overdue";
}

export function isFollowUpToday(lead: ClientLead): boolean {
  return followUpState(lead.next_follow_up_at, lead.status) === "today";
}

export function TaskChecklist({
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

// Grouped-by-enquiry flat task list — the Client Enquiry "All Tasks"
// tab, reused verbatim by Daily Tasks' "Enquiry Tasks" tab (same
// component, same API calls) so the two can never drift out of sync
// with each other.
export interface TaskGroup {
  leadId: string;
  leadTitle: string;
  tasks: ClientLeadTask[];
  /** Optional extra context columns/actions in the group header —
   * shown when given, omitted otherwise, so callers that don't have
   * them (or deliberately don't want them, like Client Enquiry's own
   * "All Tasks" tab, which stays title-only by design) aren't forced
   * to render empty badges or dead buttons. */
  leadPriority?: LeadPriority;
  leadStatus?: LeadStatus;
  leadPhone?: string | null;
  leadAllocatedName?: string | null;
  leadNextFollowUpAt?: string | null;
  leadNextFollowUpHasTime?: boolean;
}

// Status groups sort first (In Discussion, then Hold, then anything
// else) when leadStatus is provided — a no-op when it isn't, so
// Client Enquiry's own tab (which doesn't pass it) keeps whatever
// order its caller built.
const STATUS_SORT_RANK: Record<LeadStatus, number> = {
  in_discussion: 0,
  hold: 1,
  confirmed: 2,
  rejected: 3,
};

export function AllTasksTab({
  groups,
  canEdit,
  onChanged,
  onConfirmLead,
  onRejectLead,
  onToggleHoldLead,
}: {
  groups: TaskGroup[];
  canEdit: boolean;
  onChanged: () => void;
  /** Per-group Confirm/Reject/Hold actions — omit to hide the icons
   * entirely (Client Enquiry's own tab has these one click away via
   * its own card already, so it doesn't pass them). */
  onConfirmLead?: (leadId: string) => void;
  onRejectLead?: (leadId: string) => void;
  onToggleHoldLead?: (leadId: string) => void;
}) {
  const sortedGroups = [...groups].sort((a, b) => {
    if (!a.leadStatus || !b.leadStatus) return 0;
    return STATUS_SORT_RANK[a.leadStatus] - STATUS_SORT_RANK[b.leadStatus];
  });
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
      {sortedGroups.map((group) => (
        <div key={group.leadId} className="rounded-lg border border-border">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.leadTitle}</p>
            {group.leadPriority && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize ${PRIORITY_STYLE[group.leadPriority]}`}>
                {group.leadPriority}
              </span>
            )}
            {group.leadStatus && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLE[group.leadStatus]}`}>
                {STATUS_LABEL[group.leadStatus]}
              </span>
            )}
            {group.leadAllocatedName && (
              <span className="text-[10px] text-muted-foreground">→ {group.leadAllocatedName}</span>
            )}
            {group.leadNextFollowUpAt && group.leadStatus && (
              <span
                className={`text-[10px] ${
                  followUpState(group.leadNextFollowUpAt, group.leadStatus) === "overdue"
                    ? "font-semibold text-red-400"
                    : followUpState(group.leadNextFollowUpAt, group.leadStatus) === "today"
                      ? "font-semibold text-emerald-500"
                      : "text-muted-foreground"
                }`}
              >
                Ask Update {formatFollowUp(group.leadNextFollowUpAt, group.leadNextFollowUpHasTime ?? true)}
              </span>
            )}
            {group.leadPhone && (
              <a
                href={whatsappLink(group.leadPhone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in WhatsApp"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
            <div className="ml-auto flex items-center gap-1">
              {onToggleHoldLead && (
                <button
                  type="button"
                  onClick={() => onToggleHoldLead(group.leadId)}
                  aria-label={group.leadStatus === "hold" ? "Resume" : "Put on hold"}
                  className="flex h-5 w-5 items-center justify-center rounded text-amber-500 hover:bg-amber-500/10"
                >
                  {group.leadStatus === "hold" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
              )}
              {onConfirmLead && (
                <button
                  type="button"
                  onClick={() => onConfirmLead(group.leadId)}
                  aria-label="Confirm to Client Directory"
                  className="flex h-5 w-5 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
              {onRejectLead && (
                <button
                  type="button"
                  onClick={() => onRejectLead(group.leadId)}
                  aria-label="Reject"
                  className="flex h-5 w-5 items-center justify-center rounded text-red-400 hover:bg-red-500/10"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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

// Date-only OR date+time — leaving the time field blank books a bare
// date (next_follow_up_has_time: false), matching how overdue/today
// coloring treats both the same way (calendar-day comparison either
// way; the time field just controls what's *displayed*).
function FollowUpPicker({
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  date: string;
  time: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="border-border bg-muted text-foreground" />
      <Input
        type="time"
        value={time}
        onChange={(e) => onTimeChange(e.target.value)}
        placeholder="Time (optional)"
        className="border-border bg-muted text-foreground"
      />
    </div>
  );
}

function splitIso(iso: string | null, hasTime: boolean): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = hasTime ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
  return { date, time };
}

function combineDateTime(date: string, time: string): { iso: string | null; hasTime: boolean } {
  if (!date) return { iso: null, hasTime: true };
  if (time) {
    return { iso: new Date(`${date}T${time}`).toISOString(), hasTime: true };
  }
  return { iso: new Date(`${date}T00:00`).toISOString(), hasTime: false };
}

// "Mark followed up" — clears an overdue/past follow-up and
// optionally schedules the next one in the same step, instead of
// forcing a trip through the full edit dialog just to update one
// field. Skip = clear it with no new date (next_follow_up_at: null,
// so the overdue banner goes away without demanding a new date).
export function FollowUpDialog({
  open,
  onOpenChange,
  leadId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate("");
      setTime("");
    }
  }, [open]);

  async function submit(payload: { next_follow_up_at: string | null; next_follow_up_has_time?: boolean }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/client-leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error("Could not update follow-up.");
        return;
      }
      onOpenChange(false);
      onSaved();
      toast.success("Follow-up marked complete.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-popover border-border">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Follow-up complete</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label className="text-muted-foreground">Next follow-up (optional — date, or date + time)</Label>
          <FollowUpPicker date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />
        </div>
        <DialogFooter className="border-border bg-popover/50">
          <Button
            variant="outline"
            onClick={() => submit({ next_follow_up_at: null })}
            disabled={saving}
            className="border-border bg-transparent text-muted-foreground hover:bg-muted"
          >
            Skip
          </Button>
          <Button
            onClick={() => {
              const { iso, hasTime } = combineDateTime(date, time);
              submit({ next_follow_up_at: iso, next_follow_up_has_time: hasTime });
            }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadFormDialog({
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
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [allocatedUserIds, setAllocatedUserIds] = useState<string[]>([]);
  // Only meaningful when creating (initial === null) — once a lead
  // exists, adding more tasks goes through the card's own "+" (see
  // TaskChecklist), same UI either way, just after the lead exists
  // instead of before.
  const [newTasks, setNewTasks] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setPhone(initial?.phone ?? "");
    setNotes(initial?.notes ?? "");
    setPriority(initial?.priority ?? "medium");
    setSource(initial?.source ?? "");
    const { date, time } = splitIso(initial?.next_follow_up_at ?? null, initial?.next_follow_up_has_time ?? true);
    setFollowUpDate(date);
    setFollowUpTime(time);
    setAllocatedUserIds(
      initial?.allocated_user_ids?.length ? initial.allocated_user_ids : initial?.allocated_user_id ? [initial.allocated_user_id] : [],
    );
    setNewTasks([""]);
  }, [open, initial]);

  function updateTaskDraft(index: number, value: string) {
    setNewTasks((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function addTaskDraft() {
    setNewTasks((prev) => [...prev, ""]);
  }

  function removeTaskDraft(index: number) {
    setNewTasks((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const { iso, hasTime } = combineDateTime(followUpDate, followUpTime);
      const payload = {
        title: trimmed,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        priority,
        source: source || null,
        next_follow_up_at: iso,
        next_follow_up_has_time: hasTime,
        allocated_user_id: allocatedUserIds[0] ?? null,
        allocated_user_ids: allocatedUserIds,
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

      if (!initial) {
        const { lead } = await res.json();
        const taskTitles = newTasks.map((t) => t.trim()).filter(Boolean);
        for (const taskTitle of taskTitles) {
          await fetch(`/api/client-leads/${lead.id}/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: taskTitle }),
          });
        }
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
      <DialogContent className="sm:max-w-lg bg-popover border-border max-h-[88vh] overflow-y-auto overflow-x-hidden">
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
                  <SelectValue className="truncate">
                    {(v: string) => (v === "__none" ? "Not set" : SOURCE_LABEL[v as LeadSource] ?? "Not set")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="__none">Not set</SelectItem>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 grid gap-2">
              <Label className="text-muted-foreground">Allocated to</Label>
              <MultiUserSelect members={members} value={allocatedUserIds} onChange={setAllocatedUserIds} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Next follow-up (optional — date, or date + time)</Label>
            <FollowUpPicker date={followUpDate} time={followUpTime} onDateChange={setFollowUpDate} onTimeChange={setFollowUpTime} />
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="border-border bg-muted text-foreground" rows={3} />
          </div>
          {!initial && (
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Tasks</Label>
              {newTasks.map((value, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={value}
                    onChange={(e) => updateTaskDraft(i, e.target.value)}
                    placeholder={`Task ${i + 1}`}
                    className="h-8 border-border bg-muted text-sm text-foreground"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTaskDraft();
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeTaskDraft(i)}
                    className="shrink-0 text-muted-foreground hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addTaskDraft} className="w-fit">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add another task
              </Button>
              <p className="text-xs text-muted-foreground">
                More can be added later too — expand &quot;Tasks&quot; on the card and use its own + icon.
              </p>
            </div>
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
