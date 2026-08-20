"use client";

import { useCallback, useEffect, useState } from "react";
import { ListTodo, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "@/components/projects/task-board";
import { DailyTaskForm } from "@/components/daily-tasks/daily-task-form";
import { GenericBoardSettings } from "@/components/kanban/generic-board-settings";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import type {
  DailyTask,
  PipelineStage,
  ProjectTask,
  AccountMember,
  Client,
  Project,
  Pipeline,
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

  const tasksAsProjectTasks: ProjectTask[] = tasks.map((t) => ({
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
        <Button variant="outline" size="sm" onClick={() => setBoardSettingsOpen(true)}>
          <Settings className="mr-1.5 h-3.5 w-3.5" />
          Board settings
        </Button>
      </div>

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
