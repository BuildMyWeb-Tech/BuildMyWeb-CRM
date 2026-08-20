"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  KanbanCard,
  PipelineStage,
  AccountMember,
  ChecklistItem,
  TaskPriority,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Create/edit dialog for a standalone Kanban card. Direct RLS-scoped
// writes to `kanban_cards` (no API route — matches the File
// Manager/Company Info pattern; kanban_cards' RLS already enforces
// employee-update / agent-create-delete). Sibling of
// projects/task-form.tsx rather than a shared generic component —
// same reasoning as TaskBoard vs a generalized board: the two entities'
// APIs/tables differ enough that a shared abstraction would cost more
// than it saves, and Projects' working code stays untouched.

interface KanbanCardFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  currentUserId: string;
  isAdmin: boolean;
  boardId: string;
  stages: PipelineStage[];
  members: AccountMember[];
  card: KanbanCard | null;
  defaultStageId: string | null;
  onSaved: () => void;
  onDeleted: () => void;
}

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export function KanbanCardForm({
  open,
  onOpenChange,
  accountId,
  currentUserId,
  isAdmin,
  boardId,
  stages,
  members,
  card,
  defaultStageId,
  onSaved,
  onDeleted,
}: KanbanCardFormProps) {
  const supabase = createClient();
  const isEditing = !!card;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stageId, setStageId] = useState("");
  const [assigneeId, setAssigneeId] = useState("__unassigned__");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(card?.title ?? "");
    setDescription(card?.description ?? "");
    setStageId(card?.stage_id ?? defaultStageId ?? stages[0]?.id ?? "");
    setAssigneeId(card?.assignee_user_id ?? "__unassigned__");
    setPriority(card?.priority ?? "normal");
    setDueDate(card?.due_date ?? "");
    setChecklist(card?.checklist ?? []);
    setNewChecklistItem("");
  }, [open, card, defaultStageId, stages]);

  function addChecklistItem() {
    const text = newChecklistItem.trim();
    if (!text) return;
    setChecklist([...checklist, { text, done: false }]);
    setNewChecklistItem("");
  }

  function toggleChecklistItem(index: number) {
    setChecklist(checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c)));
  }

  function removeChecklistItem(index: number) {
    setChecklist(checklist.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSaving(true);

    const payload = {
      title: trimmedTitle,
      description: description.trim() || null,
      stage_id: stageId,
      assignee_user_id: assigneeId === "__unassigned__" ? null : assigneeId,
      priority,
      due_date: dueDate || null,
      checklist,
    };

    try {
      if (isEditing) {
        const { error } = await supabase.from("kanban_cards").update(payload).eq("id", card!.id);
        if (error) {
          toast.error("Could not save card.");
          return;
        }
      } else {
        const { count } = await supabase
          .from("kanban_cards")
          .select("id", { count: "exact", head: true })
          .eq("stage_id", stageId);
        const { error } = await supabase.from("kanban_cards").insert({
          account_id: accountId,
          board_id: boardId,
          position: count ?? 0,
          ...payload,
        });
        if (error) {
          toast.error("Could not create card.");
          return;
        }
      }
      onOpenChange(false);
      onSaved();
      toast.success(isEditing ? "Card updated." : "Card created.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!card) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("kanban_cards").delete().eq("id", card.id);
      if (error) {
        toast.error("Could not delete card.");
        return;
      }
      onOpenChange(false);
      onDeleted();
      toast.success("Card deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-popover border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {isEditing ? "Edit card" : "New card"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-border bg-muted text-foreground" autoFocus />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="border-border bg-muted text-foreground" rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Column</Label>
              <Select value={stageId} onValueChange={(v) => setStageId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">
                    {(value: string) => stages.find((s) => s.id === value)?.name ?? "Select a column"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[...stages].sort((a, b) => a.position - b.position).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate capitalize">{(value: string) => value}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Assignee</Label>
              <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v ?? "__unassigned__")}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">
                    {(value: string) =>
                      value === "__unassigned__" ? "Unassigned" : members.find((m) => m.user_id === value)?.full_name ?? "Unassigned"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border-border bg-muted text-foreground" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Checklist</Label>
            <div className="space-y-1.5">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox checked={item.done} onCheckedChange={() => toggleChecklistItem(i)} />
                  <span className={`flex-1 text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.text}</span>
                  <Button variant="ghost" size="icon-xs" onClick={() => removeChecklistItem(i)} className="text-muted-foreground hover:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                placeholder="Add a checklist item"
                className="border-border bg-muted text-sm text-foreground"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
              />
              <Button variant="outline" size="sm" onClick={addChecklistItem} disabled={!newChecklistItem.trim()} className="shrink-0 border-border bg-transparent text-muted-foreground hover:bg-muted">
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <CustomFieldsSection
            accountId={accountId}
            currentUserId={currentUserId}
            entityType="kanban_card"
            entityId={card?.id ?? null}
            isAdmin={isAdmin}
            canEdit={isEditing}
          />
        </div>

        <DialogFooter className="border-border bg-popover/50">
          {isEditing && (
            <Button onClick={handleDelete} disabled={deleting} className="mr-auto bg-red-600 text-white hover:bg-red-700">
              {deleting ? "Deleting…" : "Delete card"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim() || !stageId}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
