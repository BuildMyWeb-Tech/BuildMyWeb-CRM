"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsDownUp, ChevronsUpDown, LayoutGrid, Loader2, MoreVertical, Pencil, X } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { fetchAccountMembers } from "@/hooks/use-account-members";
import { createClient } from "@/lib/supabase/client";
import type { KanbanCommonStatus, ProjectTask, Project, AccountMember } from "@/types";
import { toast } from "sonner";

// Kanban — ONE unified board, all tasks from all projects, grouped
// into a shared account-wide set of status columns (not each
// project's own differently-named stages — see
// 056_common_kanban.sql). No "create a board" flow, no separate
// task list — this IS the cross-project view, matching Daily
// Tasks' "show everything, filter it down" philosophy but as a real
// drag-and-drop board instead of a table, since that's what BMW
// asked for specifically here.
export default function KanbanPage() {
  const { accountId, canManageMembers } = useAuth();
  const { canUpdate: gridCanUpdate } = usePagePermissions("kanban");

  const [statuses, setStatuses] = useState<KanbanCommonStatus[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);

  // Board name — this is a single global board (see comment above),
  // so there's no `kanban_boards` row to rename; persisted per-browser
  // rather than per-account since it's purely cosmetic.
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

  // Persisted per-browser so a column collapsed today is still
  // collapsed on the next visit — same reasoning as boardName above.
  // Keyed by status id, so it naturally survives columns being
  // renamed and just stops applying if a column is ever deleted.
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

  const visibleTasks = tasks.filter((t) => {
    if (projectFilter.size > 0 && !projectFilter.has(t.project_id)) return false;
    if (assigneeFilter.size > 0 && (!t.assignee_user_id || !assigneeFilter.has(t.assignee_user_id))) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <LayoutGrid className="h-6 w-6 text-primary" />
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{boardName}</h1>
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
      <p className="mt-1 text-sm text-muted-foreground">
        Every task, every project, one board — drag between columns, or filter down to what matters right now.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {projects.length > 0 && (
          <div>
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
          <div>
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
      </div>

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
            collapsed={collapsedColumns}
            onCollapsedChange={setCollapsedColumns}
          />
        </div>
      )}

      <UnifiedTaskQuickEdit task={editingTask} members={members} onClose={() => setEditingTask(null)} onSaved={load} />
    </div>
  );
}
