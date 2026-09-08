"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, SlidersHorizontal, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DailyTaskForm } from "@/components/daily-tasks/daily-task-form";
import { useAuth } from "@/hooks/use-auth";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { fetchAccountMembers } from "@/hooks/use-account-members";
import { createClient } from "@/lib/supabase/client";
import { DATE_PRESETS, matchesDatePreset, type DatePreset } from "@/lib/tasks/date-presets";
import type {
  DailyTask,
  PipelineStage,
  AccountMember,
  Client,
  Project,
  ProjectTask,
  Pipeline,
  TaskPriority,
} from "@/types";

// The Daily Tasks page's table — extracted so it can be reused as-is
// on the Overview page's "Project Tasks" tab (same data, same
// filters, same component; not a lookalike). Self-contained: fetches
// its own data, owns its own filter state.

interface UnifiedRow {
  kind: "daily" | "project";
  id: string;
  title: string;
  stageId: string;
  stageName: string | null;
  stageColor: string | null;
  clientId: string | null;
  projectId: string | null;
  priority: TaskPriority;
  assigneeUserId: string | null;
  dateValue: string | null;
  daily?: DailyTask;
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-500",
  urgent: "bg-red-500/15 text-red-400",
};

export function UnifiedTasksView() {
  const { accountId, user, canManageMembers, canSendMessages } = useAuth();
  const { canCreate: gridCanCreate } = usePagePermissions("daily_tasks");
  const canCreateTask = canSendMessages && gridCanCreate;
  const router = useRouter();

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);

  const [projectFilter, setProjectFilter] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("daily-tasks-project-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [clientFilter, setClientFilter] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("daily-tasks-client-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [priorityFilter, setPriorityFilter] = useState<Set<TaskPriority>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("daily-tasks-priority-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("daily-tasks-assignee-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [stageFilter, setStageFilter] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("daily-tasks-stage-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [datePreset, setDatePreset] = useState<DatePreset>(() => {
    if (typeof window === "undefined") return "all";
    const saved = window.localStorage.getItem("daily-tasks-date-filter");
    return DATE_PRESETS.some((d) => d.id === saved) ? (saved as DatePreset) : "all";
  });

  function makeToggler<T>(setFn: React.Dispatch<React.SetStateAction<Set<T>>>, storageKey: string) {
    return (value: T) => {
      setFn((prev) => {
        const next = new Set(prev);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        return next;
      });
    };
  }
  const toggleProjectFilter = makeToggler(setProjectFilter, "daily-tasks-project-filter");
  const toggleClientFilter = makeToggler(setClientFilter, "daily-tasks-client-filter");
  const togglePriorityFilter = makeToggler(setPriorityFilter, "daily-tasks-priority-filter");
  const toggleAssigneeFilter = makeToggler(setAssigneeFilter, "daily-tasks-assignee-filter");
  const toggleStageFilter = makeToggler(setStageFilter, "daily-tasks-stage-filter");

  function changeDatePreset(next: DatePreset) {
    setDatePreset(next);
    window.localStorage.setItem("daily-tasks-date-filter", next);
  }

  function clearFilters() {
    setProjectFilter(new Set());
    setClientFilter(new Set());
    setPriorityFilter(new Set());
    setAssigneeFilter(new Set());
    setStageFilter(new Set());
    setDatePreset("all");
    ["project", "client", "priority", "assignee", "stage"].forEach((k) =>
      window.localStorage.setItem(`daily-tasks-${k}-filter`, "[]"),
    );
    window.localStorage.setItem("daily-tasks-date-filter", "all");
  }

  const activeFilterCount =
    projectFilter.size + clientFilter.size + priorityFilter.size + assigneeFilter.size + stageFilter.size +
    (datePreset !== "all" ? 1 : 0);

  const load = useCallback(() => {
    if (!accountId) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("pipelines").select("*").eq("account_id", accountId).eq("name", "Daily Tasks").maybeSingle(),
      fetchAccountMembers(accountId),
      fetch("/api/clients").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/projects").then((r) => (r.ok ? r.json() : null)),
      // Every project's own board tasks too — "show everything" means
      // everything, not just this page's separate ad-hoc pipeline.
      // Embeds the task's own stage (a DIFFERENT pipeline per project,
      // not the Daily Tasks one in `stages` below) so its column badge
      // still renders correctly.
      supabase
        .from("project_tasks")
        .select("*, project:projects(id,name), stage:pipeline_stages(name,color)")
        .eq("account_id", accountId),
    ])
      .then(async ([pipelineRes, membersRows, clientsData, projectsData, projectTasksRes]) => {
        const pipelineRow = pipelineRes.data as Pipeline | null;
        setPipeline(pipelineRow);
        setMembers(membersRows);
        if (clientsData) setClients(clientsData.clients ?? []);
        if (projectsData) setProjects(projectsData.projects ?? []);
        setProjectTasks((projectTasksRes.data ?? []) as ProjectTask[]);

        if (pipelineRow) {
          const [stagesRes, tasksRes] = await Promise.all([
            supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipelineRow.id).order("position", { ascending: true }),
            supabase
              .from("daily_tasks")
              .select("*, client:clients(id,name), project:projects(id,name)")
              .eq("account_id", accountId)
              .order("target_date", { ascending: true, nullsFirst: false }),
          ]);
          setStages(stagesRes.data ?? []);
          setTasks((tasksRes.data ?? []) as DailyTask[]);
        }
      })
      .catch((err) => console.error("[unified-tasks] load failed:", err))
      .finally(() => setLoading(false));
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  function openNewTask() {
    setEditingTask(null);
    setTaskFormOpen(true);
  }

  function openEditTask(task: DailyTask) {
    setEditingTask(task);
    setTaskFormOpen(true);
  }

  const projectClientById = useMemo(() => new Map(projects.map((p) => [p.id, p.client_id])), [projects]);

  const unifiedRows: UnifiedRow[] = useMemo(() => {
    const dailyRows: UnifiedRow[] = tasks.map((t) => ({
      kind: "daily",
      id: t.id,
      title: t.title,
      stageId: t.stage_id,
      stageName: null,
      stageColor: null,
      clientId: t.client_id,
      projectId: t.project_id,
      priority: t.priority,
      assigneeUserId: t.assignee_user_id,
      dateValue: t.target_date,
      daily: t,
    }));
    // A Daily Task with a project selected mirrors itself into a
    // project_tasks row (see daily-task-form.tsx's syncLinkedProjectTask
    // and 064_daily_task_project_link.sql) so it shows up on that
    // project's own board — but that means the SAME task now has a
    // row in both `tasks` and `projectTasks` here. Without excluding
    // the mirror, it rendered as two separate table rows for one
    // task (reported: created once, showed twice; deleting either
    // row deleted both underneath, which looked like data loss).
    // The daily_tasks row is the one this table lets you edit
    // in-place (DailyTaskForm), so that's the row that stays; its
    // project_tasks mirror is dropped from THIS list — it still
    // exists and still shows on the project's own board, just not
    // duplicated here.
    const linkedProjectTaskIds = new Set(
      tasks.map((t) => t.linked_project_task_id).filter((id): id is string => !!id),
    );
    const projectRows: UnifiedRow[] = projectTasks
      .filter((t) => !linkedProjectTaskIds.has(t.id))
      .map((t) => ({
        kind: "project",
        id: t.id,
        title: t.title,
        stageId: t.stage_id,
        stageName: t.stage?.name ?? null,
        stageColor: t.stage?.color ?? null,
        clientId: projectClientById.get(t.project_id) ?? null,
        projectId: t.project_id,
        priority: t.priority,
        assigneeUserId: t.assignee_user_id,
        dateValue: t.due_date,
      }));
    return [...dailyRows, ...projectRows].sort((a, b) => {
      if (!a.dateValue && !b.dateValue) return 0;
      if (!a.dateValue) return 1;
      if (!b.dateValue) return -1;
      return a.dateValue.localeCompare(b.dateValue);
    });
  }, [tasks, projectTasks, projectClientById]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">
          Daily Tasks board not found — it should be auto-created by migration 049. Contact your admin.
        </p>
      </div>
    );
  }

  const filteredTasks = unifiedRows.filter((t) => {
    if (projectFilter.size > 0 && (!t.projectId || !projectFilter.has(t.projectId))) return false;
    if (clientFilter.size > 0 && (!t.clientId || !clientFilter.has(t.clientId))) return false;
    if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false;
    if (assigneeFilter.size > 0 && (!t.assigneeUserId || !assigneeFilter.has(t.assigneeUserId))) return false;
    // Stage chips are built from the Daily Tasks pipeline's own
    // stages only — a project task's stage lives on a different
    // pipeline entirely, so it can never match one of these chips.
    // Filtering by stage therefore narrows to daily-task rows only,
    // which is the correct behavior given the chips shown, not a bug.
    if (stageFilter.size > 0 && !stageFilter.has(t.stageId)) return false;
    if (!matchesDatePreset(t.dateValue, datePreset)) return false;
    return true;
  });

  function quickSetAssignee(id: string) {
    const next = id === "all" ? new Set<string>() : new Set([id]);
    setAssigneeFilter(next);
    window.localStorage.setItem("daily-tasks-assignee-filter", JSON.stringify([...next]));
  }
  function quickSetPriority(p: string) {
    const next = p === "all" ? new Set<TaskPriority>() : new Set([p as TaskPriority]);
    setPriorityFilter(next);
    window.localStorage.setItem("daily-tasks-priority-filter", JSON.stringify([...next]));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Quick filters — single-pick shortcuts ahead of the full
            Filters drawer, same row (same pattern on the Kanban
            page). Write into the same Sets the drawer's chips use. */}
        <Select value={assigneeFilter.size === 1 ? [...assigneeFilter][0] : "all"} onValueChange={(v) => v && quickSetAssignee(v)}>
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
        <Select value={priorityFilter.size === 1 ? [...priorityFilter][0] : "all"} onValueChange={(v) => v && quickSetPriority(v)}>
          <SelectTrigger size="sm">
            <SelectValue className="truncate">
              {(v: string) => (v === "all" ? "Priority: All" : `Priority: ${v.charAt(0).toUpperCase()}${v.slice(1)}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectItem value="all">Priority: All</SelectItem>
            {(["low", "normal", "high", "urgent"] as TaskPriority[]).map((p) => (
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
        {canCreateTask && (
          <Button onClick={openNewTask}>
            <Plus className="mr-1.5 h-4 w-4" />
            New task
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {filteredTasks.length} of {unifiedRows.length} task{unifiedRows.length === 1 ? "" : "s"}
        {activeFilterCount > 0 ? " — filtered" : ""}
      </p>

      {/* Filters — a slide-in panel from the left (icon-triggered,
          not a permanent side column) so the table gets the full
          page width. */}
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

        <FilterGroup label="Date">
          {DATE_PRESETS.map((d) => (
            <FilterChip key={d.id} active={datePreset === d.id} onClick={() => changeDatePreset(d.id)}>
              {d.label}
            </FilterChip>
          ))}
        </FilterGroup>

        {stages.length > 0 && (
          <FilterGroup label="Stage">
            {stages.map((s) => (
              <FilterChip key={s.id} active={stageFilter.has(s.id)} onClick={() => toggleStageFilter(s.id)}>
                {s.name}
              </FilterChip>
            ))}
          </FilterGroup>
        )}

        <FilterGroup label="Priority">
          {(["low", "normal", "high", "urgent"] as TaskPriority[]).map((p) => (
            <FilterChip key={p} active={priorityFilter.has(p)} onClick={() => togglePriorityFilter(p)} capitalize>
              {p}
            </FilterChip>
          ))}
        </FilterGroup>

        {projects.length > 0 && (
          <FilterGroup label="Project">
            {projects.map((p) => (
              <FilterChip key={p.id} active={projectFilter.has(p.id)} onClick={() => toggleProjectFilter(p.id)}>
                {p.name}
              </FilterChip>
            ))}
          </FilterGroup>
        )}

        {clients.length > 0 && (
          <FilterGroup label="Client">
            {clients.map((c) => (
              <FilterChip key={c.id} active={clientFilter.has(c.id)} onClick={() => toggleClientFilter(c.id)}>
                {c.name}
              </FilterChip>
            ))}
          </FilterGroup>
        )}

        {members.length > 0 && (
          <FilterGroup label="Assigned to">
            {members.map((m) => (
              <FilterChip key={m.user_id} active={assigneeFilter.has(m.user_id)} onClick={() => toggleAssigneeFilter(m.user_id)}>
                {m.full_name}
              </FilterChip>
            ))}
          </FilterGroup>
        )}
      </aside>

      <div className="mt-4">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
            <p className="text-sm text-muted-foreground">No tasks match this filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Client / Project</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Assignee</th>
                  <th className="px-3 py-2 font-medium">Target date</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const stage =
                    task.kind === "daily"
                      ? stages.find((s) => s.id === task.stageId)
                      : task.stageName
                        ? { name: task.stageName, color: task.stageColor ?? "#94a3b8" }
                        : undefined;
                  const client = clients.find((c) => c.id === task.clientId);
                  const project = projects.find((p) => p.id === task.projectId);
                  return (
                    <tr
                      key={`${task.kind}-${task.id}`}
                      onClick={() => (task.kind === "daily" ? openEditTask(task.daily!) : router.push(`/projects/${task.projectId}`))}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-3 py-2 text-foreground">
                        {task.title}
                        {task.kind === "project" && (
                          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                            Project
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {stage && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: `${stage.color}22`, color: stage.color }}
                          >
                            {stage.name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {client?.name || project?.name || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[task.priority]}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {members.find((m) => m.user_id === task.assigneeUserId)?.full_name ?? "Unassigned"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {task.dateValue ? new Date(task.dateValue).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {accountId && user && (
        <DailyTaskForm
          open={taskFormOpen}
          onOpenChange={setTaskFormOpen}
          accountId={accountId}
          currentUserId={user.id}
          isAdmin={canManageMembers}
          stages={stages}
          members={members}
          clients={clients}
          projects={projects}
          task={editingTask}
          defaultStageId={null}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  capitalize = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  capitalize?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${capitalize ? "capitalize" : ""} ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
