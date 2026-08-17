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
import type { ProjectTask, PipelineStage } from "@/types";
import { TaskCard } from "./task-card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

// Sibling of src/components/pipelines/pipeline-board.tsx, adapted
// for ProjectTask instead of Deal (no currency, adds checklist/
// attachment counts). Kept as its own component rather than
// generalizing pipeline-board.tsx — that component is fairly
// tightly typed to Deal (currency formatting, deal-specific props)
// and Sales' board is working code that didn't need touching for
// this feature.

interface TaskBoardProps {
  stages: PipelineStage[];
  tasks: ProjectTask[];
  onTaskMoved: (taskId: string, newStageId: string) => void;
  onAddTask: (stageId: string) => void;
  onEditTask: (task: ProjectTask) => void;
}

export function TaskBoard({
  stages,
  tasks,
  onTaskMoved,
  onAddTask,
  onEditTask,
}: TaskBoardProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const tasksByStage = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const task of tasks) {
      const bucket = map.get(task.stage_id);
      if (bucket) bucket.push(task);
    }
    return map;
  }, [sortedStages, tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeTask = activeTaskId
    ? tasks.find((t) => t.id === activeTaskId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const targetStageId = String(over.id);

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.stage_id === targetStageId) return;
    if (!sortedStages.some((s) => s.id === targetStageId)) return;

    onTaskMoved(taskId, targetStageId);
  }

  function handleDragCancel() {
    setActiveTaskId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="task-board-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 lg:snap-none">
        {sortedStages.map((stage) => {
          const stageTasks = tasksByStage.get(stage.id) ?? [];
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              tasks={stageTasks}
              onAddTask={onAddTask}
              onEditTask={onEditTask}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
      >
        {activeTask ? (
          <div className="opacity-90">
            <TaskCard
              task={activeTask}
              stage={sortedStages.find((s) => s.id === activeTask.stage_id) ?? null}
              onEdit={() => {}}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .task-board-scroll {
          scroll-behavior: smooth;
        }
        @media (hover: none), (pointer: coarse) {
          .task-board-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .task-board-scroll {
            scrollbar-width: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .task-board-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
          }
          .task-board-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .task-board-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .task-board-scroll::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 9999px;
          }
          .task-board-scroll::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted-foreground);
          }
        }
      `}</style>
    </DndContext>
  );
}

function StageColumn({
  stage,
  tasks,
  onAddTask,
  onEditTask,
}: {
  stage: PipelineStage;
  tasks: ProjectTask[];
  onAddTask: (stageId: string) => void;
  onEditTask: (task: ProjectTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className="flex w-[85vw] min-w-[260px] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border border-border bg-card/60 p-4 lg:w-auto lg:max-w-none lg:flex-1 lg:basis-[260px] lg:shrink lg:snap-none">
      <div
        className="-mx-4 -mt-4 h-[3px] rounded-t-xl"
        style={{ backgroundColor: stage.color }}
      />
      <div className="flex items-center justify-between pt-3">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {stage.name}
        </h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-all ${
          isOver
            ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2"
            : ""
        }`}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border py-10 text-xs text-muted-foreground">
            Drop a task here
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              task={task}
              stage={stage}
              onEdit={onEditTask}
            />
          ))
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddTask(stage.id)}
        className="mt-3 w-full justify-start border border-dashed border-border bg-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
      >
        <Plus className="mr-1 h-3 w-3" />
        Add task
      </Button>
    </div>
  );
}

function DraggableTaskCard({
  task,
  stage,
  onEdit,
}: {
  task: ProjectTask;
  stage: PipelineStage;
  onEdit: (task: ProjectTask) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
    >
      <TaskCard task={task} stage={stage} onEdit={onEdit} />
    </div>
  );
}