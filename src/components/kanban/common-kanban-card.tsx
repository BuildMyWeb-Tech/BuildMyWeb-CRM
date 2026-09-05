"use client";

import type { ProjectTask } from "@/types";
import { Calendar } from "lucide-react";

interface CommonKanbanCardProps {
  task: ProjectTask;
  onEdit: (task: ProjectTask) => void;
  isOverlay?: boolean;
}

const PRIORITY_STYLE: Record<ProjectTask["priority"], string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-500",
  urgent: "bg-red-500/15 text-red-400",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initials(name?: string | null) {
  const source = (name || "?").trim();
  return source ? source.charAt(0).toUpperCase() : "?";
}

// Sibling of projects/task-card.tsx, adapted for the cross-project
// context: shows "In {Project}" (matching the "In BMW / BMW list"
// pattern from the reference screenshot) since a card here can come
// from any project, unlike a single project's own board where that
// context is already implied by which page you're on.
export function CommonKanbanCard({ task, onEdit, isOverlay }: CommonKanbanCardProps) {
  const assigneeName = task.assignee?.full_name ?? null;

  return (
    <button
      type="button"
      onClick={(e) => {
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(task);
      }}
      className={`group w-full rounded-xl border border-border/50 bg-muted/70 px-3 py-3 text-left shadow-sm transition-all ${
        isOverlay ? "shadow-xl" : "hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-lg"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 break-words text-sm font-semibold leading-snug text-foreground">{task.title}</h4>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[task.priority]}`}>
          {task.priority}
        </span>
      </div>

      {task.project && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">In {task.project.name}</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        {task.due_date ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(task.due_date)}
          </span>
        ) : (
          <span />
        )}
        {assigneeName && (
          <span
            title={assigneeName}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(assigneeName)}
          </span>
        )}
      </div>
    </button>
  );
}
