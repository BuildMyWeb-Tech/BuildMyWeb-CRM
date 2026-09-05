"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { ProjectTask, AccountMember, TaskPriority } from "@/types";
import { toast } from "sonner";

// Lightweight quick-edit for a card on the UNIFIED cross-project
// board — priority/assignee/due date only, not the full task editor
// (title, description, checklist, stage). Full editing stays on
// that task's own project board (linked below), since this view
// deliberately doesn't know that project's own stages/columns —
// only its shared common_status_id, which drag-and-drop already
// handles without needing this dialog at all.

interface UnifiedTaskQuickEditProps {
  task: ProjectTask | null;
  members: AccountMember[];
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export function UnifiedTaskQuickEdit({ task, members, onClose, onSaved }: UnifiedTaskQuickEditProps) {
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assigneeId, setAssigneeId] = useState("__unassigned__");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setPriority(task.priority);
    setAssigneeId(task.assignee_user_id ?? "__unassigned__");
    setDueDate(task.due_date ?? "");
  }, [task]);

  async function handleSave() {
    if (!task) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("project_tasks")
        .update({
          priority,
          assignee_user_id: assigneeId === "__unassigned__" ? null : assigneeId,
          due_date: dueDate || null,
        })
        .eq("id", task.id);
      if (error) {
        toast.error("Could not save.");
        return;
      }
      onSaved();
      onClose();
      toast.success("Task updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm bg-popover border-border">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{task?.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Priority</Label>
            <Select value={priority} onValueChange={(v) => v && setPriority(v as TaskPriority)}>
              <SelectTrigger className="w-full">
                <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Assignee</Label>
            <Select value={assigneeId} onValueChange={(v) => v && setAssigneeId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue className="truncate">
                  {(v: string) => (v === "__unassigned__" ? "Unassigned" : members.find((m) => m.user_id === v)?.full_name ?? "Unassigned")}
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

          {task?.project && (
            <Link
              href={`/projects/${task.project.id}`}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open full task on {task.project.name}&apos;s board
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>

        <DialogFooter className="border-border bg-popover/50">
          <Button variant="outline" onClick={onClose} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
