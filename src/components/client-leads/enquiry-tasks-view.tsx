"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, Loader2, Pause, Play, SlidersHorizontal, X } from "lucide-react";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { useAccountMembers } from "@/hooks/use-account-members";
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  PRIORITIES,
  PRIORITY_STYLE,
  whatsappLink,
  formatFollowUp,
  followUpState,
  TaskChecklist,
} from "@/components/client-leads/lead-shared";
import { DATE_PRESETS, matchesDatePreset, type DatePreset } from "@/lib/tasks/date-presets";
import type { ClientLead, LeadPriority, LeadStatus } from "@/types";
import { toast } from "sonner";

// Overview's "Enquiry Tasks" tab — a table (same visual language as
// Project Tasks / Overview) instead of AllTasksTab's stacked cards,
// since this surface carries a lot more per-lead info (status,
// priority, assignee, follow-up, WhatsApp) that reads better as
// columns. Client Enquiry's own "All Tasks" tab stays on AllTasksTab
// by design — it's deliberately title-only there.
//
// Groups by status (In Discussion / Hold), each collapsible with a
// count badge — same pattern as the Overview side panel's project
// status groups.

const GROUPS: { status: LeadStatus; label: string; defaultOpen: boolean }[] = [
  { status: "in_discussion", label: "In Discussion", defaultOpen: true },
  { status: "hold", label: "Hold", defaultOpen: false },
];

export function EnquiryTasksView() {
  const { canUpdate } = usePagePermissions("client_leads");
  const { members } = useAccountMembers();

  const [leads, setLeads] = useState<ClientLead[] | null>(null);
  const [expandedTasksFor, setExpandedTasksFor] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<LeadStatus>>(new Set(GROUPS.filter((g) => g.defaultOpen).map((g) => g.status)));

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<Set<LeadPriority>>(new Set());
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  async function load() {
    const res = await fetch("/api/client-leads");
    if (res.ok) setLeads((await res.json()).leads ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const membersById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  function toggleGroup(status: LeadStatus) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function togglePriority(p: LeadPriority) {
    setPriorityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  const activeFilterCount = priorityFilter.size + assigneeFilter.length + (datePreset !== "all" ? 1 : 0) + (customFrom || customTo ? 1 : 0);

  function clearFilters() {
    setPriorityFilter(new Set());
    setAssigneeFilter([]);
    setDatePreset("all");
    setCustomFrom("");
    setCustomTo("");
  }

  function matchesCustomRange(iso: string | null): boolean {
    if (!customFrom && !customTo) return true;
    if (!iso) return false;
    const d = iso.slice(0, 10);
    if (customFrom && d < customFrom) return false;
    if (customTo && d > customTo) return false;
    return true;
  }

  const withTasks = (leads ?? []).filter((l) => l.status !== "confirmed" && l.status !== "rejected" && (l.tasks ?? []).length > 0);

  const filtered = withTasks.filter((l) => {
    if (priorityFilter.size > 0 && !priorityFilter.has(l.priority)) return false;
    if (assigneeFilter.length > 0) {
      const ids = l.allocated_user_ids?.length ? l.allocated_user_ids : l.allocated_user_id ? [l.allocated_user_id] : [];
      if (!ids.some((id) => assigneeFilter.includes(id))) return false;
    }
    if (datePreset !== "all" && !matchesDatePreset(l.next_follow_up_at ? l.next_follow_up_at.slice(0, 10) : null, datePreset)) return false;
    if (!matchesCustomRange(l.next_follow_up_at)) return false;
    return true;
  });

  async function handleConfirmLead(lead: ClientLead) {
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

  async function handleRejectLead(lead: ClientLead) {
    if (!window.confirm(`Reject "${lead.title}"? This deletes the lead — this can't be undone.`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not reject this lead.");
      return;
    }
    load();
    toast.success("Lead rejected and removed.");
  }

  async function handleToggleHoldLead(lead: ClientLead) {
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

  if (leads === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="w-44">
          <MultiUserSelect members={members} value={assigneeFilter} onChange={setAssigneeFilter} placeholder="People: All" />
        </div>
        <Select value={datePreset} onValueChange={(v) => v && setDatePreset(v as DatePreset)}>
          <SelectTrigger size="sm">
            <SelectValue className="truncate">{(v: string) => DATE_PRESETS.find((d) => d.id === v)?.label ?? "All"}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {DATE_PRESETS.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="relative flex h-9 items-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-sm text-foreground hover:bg-muted"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <button
        type="button"
        aria-label="Close filters"
        onClick={() => setFiltersOpen(false)}
        className={`fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition-opacity ${
          filtersOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col overflow-y-auto border-l border-border bg-card p-4 shadow-xl transition-transform duration-200 sm:max-w-sm ${
          filtersOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Filters</p>
          <div className="flex items-center gap-3">
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className="text-xs text-primary hover:underline">
                Clear
              </button>
            )}
            <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Priority</p>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePriority(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  priorityFilter.has(p) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Custom follow-up range</p>
          <div className="flex items-center gap-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 border-border bg-muted text-xs text-foreground" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 border-border bg-muted text-xs text-foreground" />
          </div>
        </div>
      </aside>

      <div className="mt-4 flex flex-col gap-4">
        {GROUPS.map((g) => {
          const groupLeads = filtered.filter((l) => l.status === g.status);
          const isOpen = openGroups.has(g.status);
          return (
            <div key={g.status} className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => toggleGroup(g.status)}
                className="flex w-full items-center gap-1.5 rounded-t-lg bg-muted/40 px-4 py-2 text-left"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">{g.label}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{groupLeads.length}</span>
              </button>
              {isOpen && (
                groupLeads.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">No enquiries here.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-t border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Enquiry</th>
                          <th className="px-3 py-2 font-medium">Priority</th>
                          <th className="px-3 py-2 font-medium">Assigned to</th>
                          <th className="px-3 py-2 font-medium">Follow-up</th>
                          <th className="px-3 py-2 font-medium">Tasks</th>
                          <th className="px-3 py-2 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupLeads.map((lead) => {
                          const ids = lead.allocated_user_ids?.length ? lead.allocated_user_ids : lead.allocated_user_id ? [lead.allocated_user_id] : [];
                          const names = ids.map((id) => membersById.get(id)?.full_name).filter(Boolean).join(", ");
                          const fu = followUpState(lead.next_follow_up_at, lead.status);
                          const tasks = lead.tasks ?? [];
                          const doneCount = tasks.filter((t) => t.is_done).length;
                          const isExpanded = expandedTasksFor === lead.id;
                          return (
                            <Fragment key={lead.id}>
                              <tr className="border-b border-border last:border-0 hover:bg-muted/50">
                                <td className="px-3 py-2 text-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <span>{lead.title}</span>
                                    {lead.phone && (
                                      <a
                                        href={whatsappLink(lead.phone)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label="Open in WhatsApp"
                                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10"
                                      >
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[lead.priority]}`}>
                                    {lead.priority}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{names || "Unassigned"}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className={
                                      fu === "overdue" ? "font-semibold text-red-400" : fu === "today" ? "font-semibold text-emerald-500" : "text-muted-foreground"
                                    }
                                  >
                                    {formatFollowUp(lead.next_follow_up_at, lead.next_follow_up_has_time)}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedTasksFor(isExpanded ? null : lead.id)}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    {doneCount}/{tasks.length}
                                  </button>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center justify-end gap-1">
                                    {canUpdate && (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleHoldLead(lead)}
                                        aria-label={lead.status === "hold" ? "Resume" : "Put on hold"}
                                        className="flex h-6 w-6 items-center justify-center rounded text-amber-500 hover:bg-amber-500/10"
                                      >
                                        {lead.status === "hold" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                                      </button>
                                    )}
                                    {canUpdate && (
                                      <button
                                        type="button"
                                        onClick={() => handleConfirmLead(lead)}
                                        aria-label="Confirm to Client Directory"
                                        className="flex h-6 w-6 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    {canUpdate && (
                                      <button
                                        type="button"
                                        onClick={() => handleRejectLead(lead)}
                                        aria-label="Reject"
                                        className="flex h-6 w-6 items-center justify-center rounded text-red-400 hover:bg-red-500/10"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="border-b border-border bg-muted/20 last:border-0">
                                  <td colSpan={6} className="px-6 py-3">
                                    <TaskChecklist leadId={lead.id} tasks={tasks} canEdit={canUpdate} onChanged={load} />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
