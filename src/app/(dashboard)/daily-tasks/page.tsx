"use client";

import { ListTodo } from "lucide-react";
import { UnifiedTasksView } from "@/components/daily-tasks/unified-tasks-view";

// Daily Task — plain filterable table (not a Kanban board): "show me
// everything, filter it down," not drag-and-drop between columns —
// that's what the standalone Kanban (/kanban) is for. Project Tasks
// and Enquiry Tasks used to be tabs on this page; both moved to
// /overview instead, so this page is single-purpose again.
export default function DailyTasksPage() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <ListTodo className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Project Tasks</h1>
      </div>
      <div className="mt-4">
        <UnifiedTasksView />
      </div>
    </div>
  );
}
