"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Project, ProjectTask, TaskPriority } from "@/types";
import { Loader2 } from "lucide-react";

// Cross-project task list — the thing BMW actually meant by "go to
// /kanban and see all tasks, filter to just OTT, or OTT + Gym".
//
// Deliberately a filterable TABLE, not a merged drag-and-drop board:
// each project's board can have different column names (admin-
// editable per project via Board Settings), so there's no single
// consistent set of columns to merge them into visually. A flat,
// filterable list sidesteps that entirely and is arguably more
// useful for "what's open across my active projects" than a forced
// merge would be. Rows link to that task's own project board rather
// than editing inline here, since editing needs that project's own
// stage list — see task-form.tsx.

type TaskRow = ProjectTask & { project: { id: string; name: string } | null };

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];
const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-500",
  urgent: "bg-red-500/15 text-red-400",
};

export function AllTasksTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Persisted per-browser — which projects/priorities are checked.
  // Empty set = "all" for both filters (matches "no filter applied"
  // being the natural default rather than "show nothing").
  const [projectFilter, setProjectFilter] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("all-tasks-project-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [priorityFilter, setPriorityFilter] = useState<Set<TaskPriority>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("all-tasks-priority-filter") ?? "[]"));
    } catch {
      return new Set();
    }
  });

  function toggleProject(id: string) {
    setProjectFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem("all-tasks-project-filter", JSON.stringify([...next]));
      return next;
    });
  }

  function togglePriority(p: TaskPriority) {
    setPriorityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      window.localStorage.setItem("all-tasks-priority-filter", JSON.stringify([...next]));
      return next;
    });
  }

  const load = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      fetch("/api/projects").then((r) => (r.ok ? r.json() : null)),
      supabase
        .from("project_tasks")
        .select("*, project:projects(id, name)")
        .order("due_date", { ascending: true, nullsFirst: false }),
    ])
      .then(([projectsData, tasksRes]) => {
        if (projectsData) setProjects(projectsData.projects ?? []);
        setTasks((tasksRes.data ?? []) as TaskRow[]);
      })
      .catch((err) => console.error("[all-tasks] load failed:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleTasks = (tasks ?? []).filter((t) => {
    if (projectFilter.size > 0 && !projectFilter.has(t.project_id)) return false;
    if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false;
    return true;
  });

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Projects</p>
          <div className="flex flex-wrap gap-1.5">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProject(p.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  projectFilter.size === 0 || projectFilter.has(p.id)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Priority</p>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePriority(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  priorityFilter.size === 0 || priorityFilter.has(p)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">No tasks match this filter.</p>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {visibleTasks.map((task) => (
            <Link
              key={task.id}
              href={task.project ? `/projects/${task.project.id}` : "#"}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{task.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {task.project?.name ?? "Unknown project"}
                  {task.due_date && ` · Due ${new Date(task.due_date).toLocaleDateString()}`}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[task.priority]}`}>
                {task.priority}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
