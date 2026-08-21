"use client";

import { useCallback, useEffect, useState } from "react";
import { ListTodo, Settings, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "@/components/projects/task-board";
import { DailyTaskForm } from "@/components/daily-tasks/daily-task-form";
import { GenericBoardSettings } from "@/components/kanban/generic-board-settings";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { DATE_PRESETS, matchesDatePreset, type DatePreset } from "@/lib/tasks/date-presets";
import type {
  DailyTask,
  PipelineStage,
  ProjectTask,
  AccountMember,
  Client,
  Project,
  Pipeline,
  TaskPriority,
} from "@/types";
import { toast } from "sonner";

// Daily Task — one shared board per account (auto-seeded by
// 049_daily_tasks.sql: To Do / Ongoing / Review / Complete), unlike
// Projects (many boards) or Kanban (many boards). Reuses TaskBoard
// the same shape-adapting way the Kanban board page does.
export default function DailyTasksPage() {
  const { accountId, user, canManageMembers } = useAuth();

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string | null>(null);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  function changeDatePreset(next: DatePreset) {
    setDatePreset(next);
    window.localStorage.setItem("daily-tasks-date-filter", next);
  }

  const activeFilterCount =
    projectFilter.size + clientFilter.size + priorityFilter.size + assigneeFilter.size + (datePreset !== "all" ? 1 : 0);

  const load = useCallback(() => {
    if (!accountId) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("pipelines").select("*").eq("account_id", accountId).eq("name", "Daily Tasks").maybeSingle(),
      fetch("/api/account/members").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/clients").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/projects").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(async ([pipelineRes, membersData, clientsData, projectsData]) => {
        const pipelineRow = pipelineRes.data as Pipeline | null;
        setPipeline(pipelineRow);
        if (membersData) setMembers(membersData.members ?? []);
        if (clientsData) setClients(clientsData.clients ?? []);
        if (projectsData) setProjects(projectsData.projects ?? []);

        if (pipelineRow) {
          const [stagesRes, tasksRes] = await Promise.all([
            supabase.from("pipeline_stages").select("*").eq("pipeline_id", pipelineRow.id).order("position", { ascending: true }),
            supabase.from("daily_tasks").select("*").eq("account_id", accountId).order("created_at", { ascending: false }),
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

  async function handleTaskMoved(taskId: string, newStageId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, stage_id: newStageId } : t)));
    const supabase = createClient();
    const { error } = await supabase.from("daily_tasks").update({ stage_id: newStageId }).eq("id", taskId);
    if (error) {
      toast.error("Could not move task — reloading board.");
      load();
    }
  }

  function handleAddTask(stageId: string) {
    setEditingTask(null);
    setDefaultStageId(stageId);
    setTaskFormOpen(true);
  }

  function handleEditFromTaskShape(task: ProjectTask) {
    const original = tasks.find((t) => t.id === task.id);
    if (original) {
      setEditingTask(original);
      setDefaultStageId(null);
      setTaskFormOpen(true);
    }
  }

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

  const filteredTasks = tasks.filter((t) => {
    if (projectFilter.size > 0 && (!t.project_id || !projectFilter.has(t.project_id))) return false;
    if (clientFilter.size > 0 && (!t.client_id || !clientFilter.has(t.client_id))) return false;
    if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false;
    if (assigneeFilter.size > 0 && (!t.assignee_user_id || !assigneeFilter.has(t.assignee_user_id))) return false;
    if (!matchesDatePreset(t.target_date, datePreset)) return false;
    return true;
  });

  const tasksAsProjectTasks: ProjectTask[] = filteredTasks.map((t) => ({
    id: t.id,
    account_id: t.account_id,
    project_id: t.project_id ?? "",
    stage_id: t.stage_id,
    title: t.title,
    description: t.brief,
    assignee_user_id: t.assignee_user_id,
    priority: t.priority,
    due_date: t.target_date,
    checklist: [],
    position: 0,
    created_at: t.created_at,
    updated_at: t.updated_at,
    assignee: t.assignee,
  }));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListTodo className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Daily Tasks</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen((v) => !v)}>
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBoardSettingsOpen(true)}>
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Board settings
          </Button>
        </div>
      </div>

      {filtersOpen && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</p>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => changeDatePreset(d.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    datePreset === d.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {projects.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Project</p>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProjectFilter(p.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      projectFilter.has(p.id)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {clients.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Client</p>
              <div className="flex flex-wrap gap-1.5">
                {clients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClientFilter(c.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      clientFilter.has(c.id)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Priority</p>
            <div className="flex flex-wrap gap-1.5">
              {(["low", "normal", "high", "urgent"] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePriorityFilter(p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    priorityFilter.has(p)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {members.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Assigned to</p>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleAssigneeFilter(m.user_id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      assigneeFilter.has(m.user_id)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <TaskBoard
          stages={stages}
          tasks={tasksAsProjectTasks}
          onTaskMoved={handleTaskMoved}
          onAddTask={handleAddTask}
          onEditTask={handleEditFromTaskShape}
        />
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
          defaultStageId={defaultStageId}
          onSaved={load}
          onDeleted={load}
        />
      )}

      <GenericBoardSettings
        open={boardSettingsOpen}
        onOpenChange={setBoardSettingsOpen}
        pipeline={pipeline}
        stages={stages}
        cardsTable="daily_tasks"
        allowRename={false}
        onChanged={load}
      />
    </div>
  );
}
