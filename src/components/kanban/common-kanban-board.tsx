"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, MoreVertical, Pencil, Trash2, Plus, Check, X } from "lucide-react";
import type { ProjectTask, KanbanCommonStatus } from "@/types";
import { CommonKanbanCard } from "./common-kanban-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Sibling of projects/task-board.tsx — same dnd-kit drag-and-drop
// core, extended with the column-level 3-dot rename/delete menu and
// independent collapse/expand toggle from the reference screenshot.
// Built as its own component rather than modifying task-board.tsx,
// since that component is working code for Projects/Daily Tasks
// this feature didn't need to touch.
//
// Collapse here is per-column (each collapses to its own narrow
// strip independently) rather than the reference's "N collapsed"
// grouped-stack behavior, which merges multiple collapsed columns
// into one shared strip — a reasonable simplification given the
// added complexity that grouped behavior would need for comparable
// value.

interface CommonKanbanBoardProps {
  statuses: KanbanCommonStatus[];
  tasks: ProjectTask[];
  isAdmin: boolean;
  onTaskMoved: (taskId: string, newStatusId: string) => void;
  onEditTask: (task: ProjectTask) => void;
  onRenameStatus: (statusId: string, newName: string) => void;
  onDeleteStatus: (statusId: string) => void;
  onAddStatus: (name: string) => void;
  /** Drag-and-drop column reordering — omit to leave columns in
   *  whatever order `statuses` arrives in (no grip handle rendered). */
  onReorderStatuses?: (orderedStatusIds: string[]) => void;
  /** Controlled collapse state — lets the page's board-level 3-dot
   *  menu drive a "collapse all / expand all" action. Falls back to
   *  internal state when omitted. */
  collapsed?: Set<string>;
  onCollapsedChange?: (next: Set<string>) => void;
}

export function CommonKanbanBoard({
  statuses,
  tasks,
  isAdmin,
  onTaskMoved,
  onEditTask,
  onRenameStatus,
  onDeleteStatus,
  onAddStatus,
  onReorderStatuses,
  collapsed: collapsedProp,
  onCollapsedChange,
}: CommonKanbanBoardProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [collapsedState, setCollapsedState] = useState<Set<string>>(new Set());
  const collapsed = collapsedProp ?? collapsedState;
  const setCollapsed = onCollapsedChange ?? setCollapsedState;
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  const sortedStatuses = useMemo(() => [...statuses].sort((a, b) => a.position - b.position), [statuses]);

  // Every task lands somewhere, even ones with no common_status_id
  // yet (created through a path that predates this feature) — they
  // fall into the first column rather than vanishing.
  const tasksByStatus = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    for (const s of sortedStatuses) map.set(s.id, []);
    const fallbackId = sortedStatuses[0]?.id;
    for (const task of tasks) {
      const key = task.common_status_id && map.has(task.common_status_id) ? task.common_status_id : fallbackId;
      if (key) map.get(key)?.push(task);
    }
    return map;
  }, [sortedStatuses, tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeTask = activeTaskId ? tasks.find((t) => t.id === activeTaskId) ?? null : null;

  function toggleCollapse(statusId: string) {
    const next = new Set(collapsed);
    if (next.has(statusId)) next.delete(statusId);
    else next.add(statusId);
    setCollapsed(next);
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith("col:")) {
      setDraggingColumnId(id.slice(4));
    } else {
      setActiveTaskId(id);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    setDraggingColumnId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);

    if (activeId.startsWith("col:")) {
      if (!onReorderStatuses) return;
      const draggedStatusId = activeId.slice(4);
      const targetStatusId = String(over.id);
      if (draggedStatusId === targetStatusId) return;
      const ids = sortedStatuses.map((s) => s.id);
      const fromIndex = ids.indexOf(draggedStatusId);
      const toIndex = ids.indexOf(targetStatusId);
      if (fromIndex === -1 || toIndex === -1) return;
      const reordered = [...ids];
      reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, draggedStatusId);
      onReorderStatuses(reordered);
      return;
    }

    const taskId = activeId;
    const targetStatusId = String(over.id);

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.common_status_id === targetStatusId) return;
    if (!sortedStatuses.some((s) => s.id === targetStatusId)) return;

    onTaskMoved(taskId, targetStatusId);
  }

  function handleDragCancel() {
    setActiveTaskId(null);
    setDraggingColumnId(null);
  }

  function submitAddColumn() {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    onAddStatus(trimmed);
    setNewColumnName("");
    setAddingColumn(false);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
        {sortedStatuses.map((status) => (
          <StatusColumn
            key={status.id}
            status={status}
            tasks={tasksByStatus.get(status.id) ?? []}
            isAdmin={isAdmin}
            isCollapsed={collapsed.has(status.id)}
            isDraggingOtherColumn={!!draggingColumnId && draggingColumnId !== status.id}
            draggable={!!onReorderStatuses}
            onToggleCollapse={() => toggleCollapse(status.id)}
            onEditTask={onEditTask}
            onRename={(name) => onRenameStatus(status.id, name)}
            onDelete={() => onDeleteStatus(status.id)}
          />
        ))}

        {isAdmin && (
          <div className="w-[220px] shrink-0">
            {addingColumn ? (
              <div className="flex items-center gap-1 rounded-xl border border-dashed border-border bg-card/60 p-2">
                <Input
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Column name"
                  autoFocus
                  className="h-8 border-border bg-muted text-sm text-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitAddColumn();
                    if (e.key === "Escape") setAddingColumn(false);
                  }}
                />
                <Button variant="ghost" size="icon-xs" onClick={submitAddColumn} className="shrink-0 text-emerald-500">
                  <Check className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={() => setAddingColumn(false)} className="shrink-0 text-muted-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingColumn(true)}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Add column
              </button>
            )}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeTask ? (
          <div className="w-[260px] opacity-90">
            <CommonKanbanCard task={activeTask} onEdit={() => {}} isOverlay />
          </div>
        ) : draggingColumnId ? (
          <div className="w-[260px] rounded-xl border border-primary/40 bg-card/90 p-3 text-sm font-semibold text-foreground opacity-90">
            {sortedStatuses.find((s) => s.id === draggingColumnId)?.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function StatusColumn({
  status,
  tasks,
  isAdmin,
  isCollapsed,
  isDraggingOtherColumn,
  draggable,
  onToggleCollapse,
  onEditTask,
  onRename,
  onDelete,
}: {
  status: KanbanCommonStatus;
  tasks: ProjectTask[];
  isAdmin: boolean;
  isCollapsed: boolean;
  isDraggingOtherColumn: boolean;
  draggable: boolean;
  onToggleCollapse: () => void;
  onEditTask: (task: ProjectTask) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id, disabled: isCollapsed });
  const { attributes, listeners, setNodeRef: setHandleRef, isDragging: isThisColumnDragging } = useDraggable({
    id: `col:${status.id}`,
    disabled: !draggable,
  });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(status.name);

  function submitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== status.name) onRename(trimmed);
    setRenaming(false);
  }

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-card/60 py-3 hover:bg-muted/60"
        title={`Expand ${status.name}`}
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{tasks.length}</span>
        <span
          className="mt-1 text-xs font-medium text-foreground"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          {status.name}
        </span>
      </button>
    );
  }

  return (
    <div
      ref={setHandleRef}
      className={`flex w-[85vw] min-w-[260px] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border border-border bg-card/60 p-4 lg:w-auto lg:max-w-none lg:flex-1 lg:basis-[260px] lg:shrink lg:snap-none ${
        isThisColumnDragging ? "opacity-30" : ""
      } ${isDraggingOtherColumn && isOver ? "outline outline-2 outline-dashed outline-primary/60 outline-offset-2" : ""}`}
    >
      <div className="-mx-4 -mt-4 h-[3px] rounded-t-xl" style={{ backgroundColor: status.color }} />
      <div className="flex items-center justify-between gap-1 pt-3">
        {draggable && !renaming && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label={`Drag to reorder ${status.name}`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        {renaming ? (
          <div className="flex flex-1 items-center gap-1">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="h-7 border-border bg-muted text-sm text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
            />
            <Button variant="ghost" size="icon-xs" onClick={submitRename} className="shrink-0 text-emerald-500">
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <h3 className="truncate text-sm font-semibold text-foreground">{status.name}</h3>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{tasks.length}</span>
          {isAdmin && !renaming && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setRenameValue(status.name); setRenaming(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="ghost" size="icon-xs" onClick={onToggleCollapse} className="text-muted-foreground hover:text-foreground" title="Collapse column">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-all ${
          isOver ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2" : ""
        }`}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border py-10 text-xs text-muted-foreground">
            No tasks here
          </div>
        ) : (
          tasks.map((task) => <DraggableCard key={task.id} task={task} onEdit={onEditTask} />)
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task, onEdit }: { task: ProjectTask; onEdit: (task: ProjectTask) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}>
      <CommonKanbanCard task={task} onEdit={onEdit} />
    </div>
  );
}
