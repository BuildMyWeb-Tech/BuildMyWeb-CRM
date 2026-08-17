"use client";

import type { ProjectTask, PipelineStage } from "@/types";
import { Calendar, Paperclip, ListChecks } from "lucide-react";

interface TaskCardProps {
  task: ProjectTask;
  stage: PipelineStage | null;
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
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function initials(name?: string | null) {
  const source = (name || "?").trim();
  return source ? source.charAt(0).toUpperCase() : "?";
}

export function TaskCard({ task, stage, onEdit, isOverlay }: TaskCardProps) {
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const checklistTotal = task.checklist.length;
  const assigneeName = task.assignee?.full_name ?? null;
  const attachmentCount = task.attachments?.length ?? 0;

  return (
    <button
      type="button"
      onClick={(e) => {
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(task);
      }}
      className={`group relative w-full cursor-pointer rounded-xl border border-border/50 bg-muted/70 pl-4 pr-3 py-3 text-left shadow-sm transition-all ${
        isOverlay
          ? "shadow-xl"
          : "hover:-translate-y-0.5 hover:border-border hover:bg-muted hover:shadow-lg"
      }`}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
      />

      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 text-sm font-semibold leading-snug text-foreground break-words">
          {task.title}
        </h4>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[task.priority]}`}
        >
          {task.priority}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {task.due_date && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(task.due_date)}
          </span>
        )}
        {checklistTotal > 0 && (
          <span className="flex items-center gap-1">
            <ListChecks className="h-3 w-3" />
            {checklistDone}/{checklistTotal}
          </span>
        )}
        {attachmentCount > 0 && (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {attachmentCount}
          </span>
        )}
      </div>

      {assigneeName && (
        <div className="mt-2 flex items-center justify-end">
          <span
            title={assigneeName}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(assigneeName)}
          </span>
        </div>
      )}
    </button>
  );
}