"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DailyTaskForm } from "@/components/daily-tasks/daily-task-form";
import { useAuth } from "@/hooks/use-auth";
import { usePagePermissions } from "@/hooks/use-page-permissions";
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

// Unified row shape so the table can show `daily_tasks` (this page's
// own ad-hoc pipeline) and `project_tasks` (every project's own
// board) side by side — see the load() comment for why both belong
// here now. `kind` drives what a row click does: a daily-task row
// opens DailyTaskForm in place, same as always; a project-task row
// opens its own project's board instead of trying to reconstruct
// TaskForm's per-project stage list here.
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

// Daily Task — plain filterable table now, not a Kanban board. BMW's
// call: this page is for "show me everything, filter it down," not
// drag-and-drop between columns — that's what the standalone Kanban
// (/kanban) is for. Stage is still a real concept (still comes from
// the auto-seeded "Daily Tasks" pipeline, and the create/edit form
// still lets you set it), it's just a column here, not something
// dragged between.
const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-500",
  urgent: "bg-red-500/15 text-red-400",
};

export default function DailyTasksPage() {
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
      fetch("/api/account/members").then((r) => (r.ok ? r.json() : null)),
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
      .then(async ([pipelineRes, membersData, clientsData, projectsData, projectTasksRes]) => {
        const pipelineRow = pipelineRes.data as Pipeline | null;
        setPipeline(pipelineRow);
        if (membersData) setMembers(membersData.members ?? []);
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
      .catch((err) => console.error("[daily-tasks] load failed:", err))
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
    const projectRows: UnifiedRow[] = projectTasks.map((t) => ({
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
    // stages only (see the sidebar below) — a project task's stage
    // lives on a different pipeline entirely, so it can never match
    // one of these chips. Filtering by stage therefore narrows to
    // daily-task rows only, which is the correct behavior given the
    // chips shown, not a bug.
    if (stageFilter.size > 0 && !stageFilter.has(t.stageId)) return false;
    if (!matchesDatePreset(t.dateValue, datePreset)) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListTodo className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Daily Tasks</h1>
        </div>
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

      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        {/* Filters — left column, always visible, not a dropdown */}
        <aside className="w-full shrink-0 lg:w-56">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</p>
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className="text-xs text-primary hover:underline">
                Clear
              </button>
            )}
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

        {/* Table — main column */}
        <div className="min-w-0 flex-1">
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
