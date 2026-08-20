"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Settings, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "@/components/projects/task-board";
import { KanbanCardForm } from "@/components/kanban/kanban-card-form";
import { GenericBoardSettings } from "@/components/kanban/generic-board-settings";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import type { KanbanBoard, PipelineStage, KanbanCard, ProjectTask, AccountMember } from "@/types";
import { toast } from "sonner";

// Standalone Kanban board view. Reuses the Projects module's
// TaskBoard/TaskCard as-is (they're pure presentational — no
// internal fetch calls, no Projects-specific API references) by
// mapping KanbanCard -> the ProjectTask shape TaskBoard expects at
// this page's boundary, rather than duplicating drag-and-drop code
// a third time. `board_id` stands in for `project_id` since
// TaskBoard/TaskCard never actually read that field, only pass it
// through untouched.
export default function KanbanBoardPage() {
  const params = useParams<{ id: string }>();
  const { accountId, user, canManageMembers } = useAuth();

  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [pipeline, setPipeline] = useState<{ id: string; user_id: string; name: string; created_at: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<KanbanCard | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string | null>(null);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/kanban-boards/${params.id}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/account/members").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([boardData, membersData]) => {
        if (boardData) {
          setBoard(boardData.board);
          setStages(boardData.stages);
          setCards(boardData.cards);
          setPipeline({
            id: boardData.board.pipeline_id,
            user_id: "",
            name: boardData.board.name,
            created_at: boardData.board.created_at,
          });
        }
        if (membersData) setMembers(membersData.members ?? []);
      })
      .catch((err) => console.error("[kanban-board] load failed:", err))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCardMoved(cardId: string, newStageId: string) {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage_id: newStageId } : c)));
    const supabase = createClient();
    const { error } = await supabase.from("kanban_cards").update({ stage_id: newStageId }).eq("id", cardId);
    if (error) {
      toast.error("Could not move card — reloading board.");
      load();
    }
  }

  function handleAddCard(stageId: string) {
    setEditingCard(null);
    setDefaultStageId(stageId);
    setCardFormOpen(true);
  }

  function handleEditFromTaskShape(task: ProjectTask) {
    const original = cards.find((c) => c.id === task.id);
    if (original) {
      setEditingCard(original);
      setDefaultStageId(null);
      setCardFormOpen(true);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">Board not found.</p>
        <Link href="/kanban">
          <Button variant="outline" size="sm">Back to Kanban</Button>
        </Link>
      </div>
    );
  }

  // Shape-adapt for TaskBoard/TaskCard — see file header note.
  const cardsAsTasks: ProjectTask[] = cards.map((c) => ({
    id: c.id,
    account_id: c.account_id,
    project_id: c.board_id,
    stage_id: c.stage_id,
    title: c.title,
    description: c.description,
    assignee_user_id: c.assignee_user_id,
    priority: c.priority,
    due_date: c.due_date,
    checklist: c.checklist,
    position: c.position,
    created_at: c.created_at,
    updated_at: c.updated_at,
    assignee: c.assignee,
  }));

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/kanban" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{board.name}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => setBoardSettingsOpen(true)}>
          <Settings className="mr-1.5 h-3.5 w-3.5" />
          Board settings
        </Button>
      </div>

      <div className="mt-6">
        <TaskBoard
          stages={stages}
          tasks={cardsAsTasks}
          onTaskMoved={handleCardMoved}
          onAddTask={handleAddCard}
          onEditTask={handleEditFromTaskShape}
        />
      </div>

      {accountId && user && (
        <KanbanCardForm
          open={cardFormOpen}
          onOpenChange={setCardFormOpen}
          accountId={accountId}
          currentUserId={user.id}
          isAdmin={canManageMembers}
          boardId={board.id}
          stages={stages}
          members={members}
          card={editingCard}
          defaultStageId={defaultStageId}
          onSaved={load}
          onDeleted={load}
        />
      )}

      {pipeline && (
        <GenericBoardSettings
          open={boardSettingsOpen}
          onOpenChange={setBoardSettingsOpen}
          pipeline={pipeline}
          stages={stages}
          cardsTable="kanban_cards"
          onChanged={load}
        />
      )}
    </div>
  );
}
