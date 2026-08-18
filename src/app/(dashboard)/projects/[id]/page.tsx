"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Settings, Loader2, LayoutGrid, Folder } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "@/components/projects/task-board";
import { TaskForm } from "@/components/projects/task-form";
import { BoardSettings } from "@/components/projects/board-settings";
import { FileManager } from "@/components/files/file-manager";
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
  const [tab, setTab] = useState<"board" | "files">("board");

  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string | null>(null);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);

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
     <Button
          variant="outline"
          size="sm"
          onClick={() => setBoardSettingsOpen(true)}
          className={tab === "files" ? "invisible" : undefined}
        >
          <Settings className="mr-1.5 h-3.5 w-3.5" />
          Board settings
        </Button>
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
      </div>

      {tab === "board" ? (
        <div className="mt-6">
          <TaskBoard
            stages={stages}
            tasks={tasks}
            onTaskMoved={handleTaskMoved}
            onAddTask={handleAddTask}
            onEditTask={handleEditTask}
          />
        </div>
      ) : (
        accountId &&
        user && (
          <div className="mt-6">
            <FileManager accountId={accountId} userId={user.id} projectId={project.id} />
          </div>
        )
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
    </div>
  );
}