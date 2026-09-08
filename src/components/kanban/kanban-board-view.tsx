"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsDownUp, ChevronsUpDown, MoreVertical, Pencil, SlidersHorizontal, X } from "lucide-react";
import { CommonKanbanBoard } from "@/components/kanban/common-kanban-board";
import { UnifiedTaskQuickEdit } from "@/components/kanban/unified-task-quick-edit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/hooks/use-auth";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { fetchAccountMembers } from "@/hooks/use-account-members";
import { createClient } from "@/lib/supabase/client";
import { LayoutGrid, Loader2, User } from "lucide-react";
import type { KanbanCommonStatus, ProjectTask, Project, AccountMember, TaskPriority } from "@/types";
import { toast } from "sonner";

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

// The Kanban page's board — extracted so it can be reused as-is on
// the Overview page's "Kanban" tab (same data, same board, same
// component; not a lookalike).
export function KanbanBoardView() {
  const { accountId, canManageMembers } = useAuth();
  const { canUpdate: gridCanUpdate } = usePagePermissions("kanban");

  const [statuses, setStatuses] = useState<KanbanCommonStatus[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);

  const [boardName, setBoardName] = useState(() => {
    if (typeof window === "undefined") return "Kanban";
    return window.localStorage.getItem("kanban-board-name") ?? "Kanban";
  });
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState(boardName);
  function submitBoardRename() {
    const trimmed = boardNameDraft.trim();
    if (trimmed) {
      setBoardName(trimmed);
      window.localStorage.setItem("kanban-board-name", trimmed);
    }
    setRenamingBoard(false);
  }

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [collapsedColumns, setCollapsedColumnsState] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("kanban-collapsed-columns") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  function setCollapsedColumns(next: Set<string>) {
    setCollapsedColumnsState(next);
    window.localStorage.setItem("kanban-collapsed-columns", JSON.stringify([...next]));
  }

  const [projectFilter, setProjectFilter] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("kanban-project-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("kanban-assignee-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });

  function toggleProjectFilter(id: string) {
    setProjectFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem("kanban-project-filter", JSON.stringify([...next]));
      return next;
    });
  }

  function toggleAssigneeFilter(id: string) {
    setAssigneeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem("kanban-assignee-filter", JSON.stringify([...next]));
      return next;
    });
  }

  const [priorityFilter, setPriorityFilterState] = useState<Set<TaskPriority>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("kanban-priority-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  function setPriorityFilter(next: Set<TaskPriority>) {
    setPriorityFilterState(next);
    window.localStorage.setItem("kanban-priority-filter", JSON.stringify([...next]));
  }

  const load = useCallback(() => {
    if (!accountId) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("kanban_common_statuses").select("*").eq("account_id", accountId).order("position", { ascending: true }),
      supabase.from("project_tasks").select("*, project:projects(id,name)").eq("account_id", accountId),
      fetch("/api/projects").then((r) => (r.ok ? r.json() : null)),
      fetchAccountMembers(accountId),
    ])
      .then(([statusesRes, tasksRes, projectsData, membersRows]) => {
        setStatuses(statusesRes.data ?? []);
        setTasks((tasksRes.data ?? []) as ProjectTask[]);
        if (projectsData) setProjects(projectsData.projects ?? []);
        setMembers(membersRows);
      })
      .catch((err) => console.error("[kanban] load failed:", err))
      .finally(() => setLoading(false));
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTaskMoved(taskId: string, newStatusId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, common_status_id: newStatusId } : t)));
    const supabase = createClient();
    const { error } = await supabase.from("project_tasks").update({ common_status_id: newStatusId }).eq("id", taskId);
    if (error) {
      toast.error("Could not move task — reloading board.");
      load();
    }
  }

  async function handleRenameStatus(statusId: string, newName: string) {
    const supabase = createClient();
    const { error } = await supabase.from("kanban_common_statuses").update({ name: newName }).eq("id", statusId);
    if (error) {
      toast.error("Could not rename column.");
      return;
    }
    setStatuses((prev) => prev.map((s) => (s.id === statusId ? { ...s, name: newName } : s)));
  }

  async function handleDeleteStatus(statusId: string) {
    const tasksInColumn = tasks.filter((t) => (t.common_status_id ?? statuses[0]?.id) === statusId).length;
    if (tasksInColumn > 0) {
      toast.error("Move the tasks out of this column first.");
      return;
    }
    if (statuses.length <= 1) {
      toast.error("You need at least one column.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("kanban_common_statuses").delete().eq("id", statusId);
    if (error) {
      toast.error("Could not delete column.");
      return;
    }
    setStatuses((prev) => prev.filter((s) => s.id !== statusId));
  }

  async function handleAddStatus(name: string) {
    if (!accountId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("kanban_common_statuses")
      .insert({ account_id: accountId, name, position: statuses.length + 1 })
      .select()
      .single();
    if (error || !data) {
      toast.error("Could not add column.");
      return;
    }
    setStatuses((prev) => [...prev, data]);
  }

  async function handleReorderStatuses(orderedIds: string[]) {
    const prevStatuses = statuses;
    // Optimistic — reflect the drag immediately, reconcile position
    // numbers with the server in the background.
    setStatuses((prev) =>
      [...prev].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)),
    );
    const supabase = createClient();
    const results = await Promise.all(
      orderedIds.map((id, i) => supabase.from("kanban_common_statuses").update({ position: i + 1 }).eq("id", id)),
    );
    if (results.some((r) => r.error)) {
      toast.error("Could not save the new column order.");
      setStatuses(prevStatuses);
      return;
    }
    setStatuses((prev) => prev.map((s) => ({ ...s, position: orderedIds.indexOf(s.id) + 1 })));
  }

  const visibleTasks = tasks.filter((t) => {
    if (projectFilter.size > 0 && !projectFilter.has(t.project_id)) return false;
    if (assigneeFilter.size > 0 && (!t.assignee_user_id || !assigneeFilter.has(t.assignee_user_id))) return false;
    if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false;
    return true;
  });

  const activeFilterCount = projectFilter.size + assigneeFilter.size + priorityFilter.size;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 shrink-0 text-primary" />
          {renamingBoard ? (
            <div className="flex items-center gap-1">
              <Input
                value={boardNameDraft}
                onChange={(e) => setBoardNameDraft(e.target.value)}
                autoFocus
                className="h-8 w-48 border-border bg-muted text-lg font-bold text-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitBoardRename();
                  if (e.key === "Escape") setRenamingBoard(false);
                }}
              />
              <Button variant="ghost" size="icon-xs" onClick={submitBoardRename} className="text-emerald-500">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setRenamingBoard(false)} className="text-muted-foreground">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h2 className="text-lg font-semibold text-foreground">{boardName}</h2>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  setBoardNameDraft(boardName);
                  setRenamingBoard(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename board
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCollapsedColumns(new Set(statuses.map((s) => s.id)))}>
                <ChevronsDownUp className="h-3.5 w-3.5" />
                Collapse all columns
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCollapsedColumns(new Set())}>
                <ChevronsUpDown className="h-3.5 w-3.5" />
                Expand all columns
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Quick filters — single-pick shortcuts for the two most
            common narrows, ahead of the full Filters drawer (same
            row, same pattern as Daily Tasks). Both write into the
            same Sets the drawer's own chips use, so there's one
            source of truth either way you filter. */}
        <div className="flex items-center gap-2">
          <Select
            value={assigneeFilter.size === 1 ? [...assigneeFilter][0] : "all"}
            onValueChange={(v) => v && setAssigneeFilter(v === "all" ? new Set() : new Set([v]))}
          >
            <SelectTrigger size="sm">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue className="truncate">
                {(v: string) => (v === "all" ? "People: All" : members.find((m) => m.user_id === v)?.full_name ?? "People: All")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">People: All</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priorityFilter.size === 1 ? [...priorityFilter][0] : "all"}
            onValueChange={(v) => v && setPriorityFilter(v === "all" ? new Set() : new Set([v as TaskPriority]))}
          >
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
          <Button variant="outline" onClick={() => setFiltersOpen(true)} className="relative">
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every task, every project, one board — drag between columns, or filter down to what matters right now.
      </p>

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
              <button
                type="button"
                onClick={() => {
                  setProjectFilter(new Set());
                  window.localStorage.setItem("kanban-project-filter", "[]");
                  setAssigneeFilter(new Set());
                  window.localStorage.setItem("kanban-assignee-filter", "[]");
                  setPriorityFilter(new Set());
                }}
                className="text-xs text-primary hover:underline"
              >
                Clear
              </button>
            )}
            <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Project</p>
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProjectFilter(p.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    projectFilter.has(p.id) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {members.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Assigned to</p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggleAssigneeFilter(m.user_id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    assigneeFilter.has(m.user_id) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.full_name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Priority</p>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const next = new Set(priorityFilter);
                  if (next.has(p)) next.delete(p);
                  else next.add(p);
                  setPriorityFilter(next);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  priorityFilter.has(p) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : statuses.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No board columns set up yet — this should be auto-created by migration 056. Contact your admin.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <CommonKanbanBoard
            statuses={statuses}
            tasks={visibleTasks}
            isAdmin={canManageMembers && gridCanUpdate}
            onTaskMoved={handleTaskMoved}
            onEditTask={setEditingTask}
            onRenameStatus={handleRenameStatus}
            onDeleteStatus={handleDeleteStatus}
            onAddStatus={handleAddStatus}
            onReorderStatuses={handleReorderStatuses}
            collapsed={collapsedColumns}
            onCollapsedChange={setCollapsedColumns}
          />
        </div>
      )}

      <UnifiedTaskQuickEdit task={editingTask} members={members} onClose={() => setEditingTask(null)} onSaved={load} />
    </div>
  );
}
