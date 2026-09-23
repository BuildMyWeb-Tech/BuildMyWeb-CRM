"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Settings, Loader2, LayoutGrid, Folder, MessageSquare, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "@/components/projects/task-board";
import { TaskForm } from "@/components/projects/task-form";
import { BoardSettings } from "@/components/projects/board-settings";
import { ProjectSettings } from "@/components/projects/project-settings";
import { CombinedFilesView } from "@/components/files/combined-files-view";
import { ProjectChat } from "@/components/projects/project-chat";
import { useAuth } from "@/hooks/use-auth";
import type {
  Project,
  PipelineStage,
  ProjectTask,
  AccountMember,
} from "@/types";
import { toast } from "sonner";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const { accountId, user } = useAuth();
  const [tab, setTab] = useState<"board" | "files" | "chat">("board");

  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string | null>(null);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [taskViewMode, setTaskViewMode] = useState<"current" | "scheduled" | "all">("current");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/projects/${params.id}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/account/members").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([projectData, membersData]) => {
        if (projectData) {
          setProject(projectData.project);
          setStages(projectData.stages);
          setTasks(projectData.tasks);
        }
        if (membersData) {
          setMembers(membersData.members ?? []);
        }
      })
      .catch((err) => console.error('[project-detail] load failed:', err))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleTaskMoved(taskId: string, newStageId: string) {
    // Optimistic — the board should feel instant on drag.
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, stage_id: newStageId } : t)),
    );
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: newStageId }),
    });
    if (!res.ok) {
      toast.error("Could not move task — reloading board.");
      load();
    }
  }

  function handleAddTask(stageId: string) {
    setEditingTask(null);
    setDefaultStageId(stageId);
    setTaskFormOpen(true);
  }

  function handleEditTask(task: ProjectTask) {
    setEditingTask(task);
    setDefaultStageId(null);
    setTaskFormOpen(true);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Link href="/projects">
          <Button variant="outline" size="sm">
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href="/projects"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {project.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {project.contact?.name || project.client_name || "No client linked"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setProjectSettingsOpen(true)}>
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Project settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBoardSettingsOpen(true)}
            className={tab !== "board" ? "invisible" : undefined}
          >
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Board settings
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("board")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "board"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Board
        </button>
        <button
          type="button"
          onClick={() => setTab("files")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "files"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Folder className="h-3.5 w-3.5" />
          Files
        </button>
        <button
          type="button"
          onClick={() => setTab("chat")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "chat"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </button>
      </div>

      {tab === "board" && (() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const stageNameOf = (name: string) => stages.find((s) => s.name.toLowerCase().includes(name.toLowerCase()))?.id;
        const inProgressId = stageNameOf("progress");
        const reviewId = stageNameOf("review");
        const todoId = stageNameOf("to do") ?? stageNameOf("todo");
        const holdId = stageNameOf("hold");
        const waitingId = stageNameOf("waiting");
        const overdueTasks = tasks.filter((t) => (t as unknown as { due_date?: string }).due_date && (t as unknown as { due_date: string }).due_date < todayStr);

        // Filter tasks for board based on view mode
        const filteredTasks = tasks.filter((t) => {
          const sd = (t as unknown as { show_date?: string }).show_date;
          if (taskViewMode === "current" && sd && sd > todayStr) return false;
          if (taskViewMode === "scheduled" && !(sd && sd > todayStr)) return false;
          if (overdueOnly && !((t as unknown as { due_date?: string }).due_date && (t as unknown as { due_date: string }).due_date < todayStr)) return false;
          return true;
        });

        const STAT_CARDS = [
          { label: "Total Tasks", count: tasks.length, color: "text-foreground" },
          { label: "In Progress", count: inProgressId ? tasks.filter((t) => t.stage_id === inProgressId).length : 0, color: "text-blue-500" },
          { label: "Review", count: reviewId ? tasks.filter((t) => t.stage_id === reviewId).length : 0, color: "text-yellow-500" },
          { label: "To Do", count: todoId ? tasks.filter((t) => t.stage_id === todoId).length : 0, color: "text-slate-400" },
          { label: "Hold", count: holdId ? tasks.filter((t) => t.stage_id === holdId).length : 0, color: "text-orange-400" },
          { label: "Waiting on Client", count: waitingId ? tasks.filter((t) => t.stage_id === waitingId).length : 0, color: "text-purple-400" },
        ];

        return (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STAT_CARDS.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-card px-3 py-2.5 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* View mode + overdue controls */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                {(["current", "scheduled", "all"] as const).map((mode) => (
                  <button key={mode} type="button" onClick={() => setTaskViewMode(mode)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${taskViewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {mode === "current" ? "Current" : mode === "scheduled" ? "Scheduled" : "All Tasks"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setOverdueOnly((v) => !v)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${overdueOnly ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
                Overdue ({overdueTasks.length})
              </button>
            </div>

            <div className="mt-4">
              <TaskBoard
                stages={stages}
                tasks={filteredTasks}
                onTaskMoved={handleTaskMoved}
                onAddTask={handleAddTask}
                onEditTask={handleEditTask}
              />
            </div>
          </>
        );
      })()}
      {tab === "files" && accountId && user && (
        <div className="mt-6">
          <CombinedFilesView accountId={accountId} userId={user.id} projectId={project.id} />
        </div>
      )}
      {tab === "chat" && accountId && user && (
        <div className="mt-6">
          <ProjectChat projectId={project.id} accountId={accountId} currentUserId={user.id} members={members} />
        </div>
      )}

      {accountId && (
        <TaskForm
          open={taskFormOpen}
          onOpenChange={setTaskFormOpen}
          accountId={accountId}
          projectId={project.id}
          stages={stages}
          members={members}
          task={editingTask}
          defaultStageId={defaultStageId}
          onSaved={load}
          onDeleted={load}
        />
      )}

      {project.pipeline && (
        <BoardSettings
          open={boardSettingsOpen}
          onOpenChange={setBoardSettingsOpen}
          pipeline={project.pipeline}
          stages={stages}
          onChanged={load}
        />
      )}

      <ProjectSettings
        open={projectSettingsOpen}
        onOpenChange={setProjectSettingsOpen}
        project={project}
        onSaved={(updated) => setProject({ ...project, ...updated })}
        onDeleted={() => {}}
      />
    </div>
  );
}
