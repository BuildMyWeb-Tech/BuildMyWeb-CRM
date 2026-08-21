"use client";

import { useState } from "react";
import { LayoutGrid, ListTodo } from "lucide-react";
import { AllTasksTab } from "@/components/kanban/all-tasks-tab";
import { StandaloneBoardsTab } from "@/components/kanban/standalone-boards-tab";

type KanbanTab = "all-tasks" | "boards";

// "All Tasks" (cross-project filterable list) is the default —
// that's what BMW actually wanted at this URL. "Boards" is the
// original standalone-Kanban feature, kept as a second tab rather
// than removed.
export default function KanbanPage() {
  const [tab, setTab] = useState<KanbanTab>("all-tasks");

  return (
    <div>
      <div className="flex items-center gap-2">
        <LayoutGrid className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Kanban</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        All tasks across your projects, filterable — or ad-hoc standalone boards.
      </p>

      <div className="mt-4 flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("all-tasks")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "all-tasks"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ListTodo className="h-3.5 w-3.5" />
          All Tasks
        </button>
        <button
          type="button"
          onClick={() => setTab("boards")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "boards"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Boards
        </button>
      </div>

      {tab === "all-tasks" ? <AllTasksTab /> : <StandaloneBoardsTab />}
    </div>
  );
}
