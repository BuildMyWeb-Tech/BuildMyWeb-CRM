"use client";

import { KanbanBoardView } from "@/components/kanban/kanban-board-view";

// Kanban — ONE unified board, all tasks from all projects, grouped
// into a shared account-wide set of status columns (not each
// project's own differently-named stages — see
// 056_common_kanban.sql). No "create a board" flow, no separate
// task list — this IS the cross-project view, matching Daily
// Tasks' "show everything, filter it down" philosophy but as a real
// drag-and-drop board instead of a table, since that's what BMW
// asked for specifically here.
export default function KanbanPage() {
  return <KanbanBoardView />;
}
