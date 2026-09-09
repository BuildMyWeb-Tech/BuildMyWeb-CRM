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
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import type { ProjectTask, AccountMember, TaskPriority } from "@/types";
import { toast } from "sonner";

// Quick-edit for a project task from anywhere that lists it without
// being on that task's own project board — the unified cross-project
// Kanban, and Project Tasks / Overview's table. Covers title,
// priority, assignee(s), due date; full editing (description,
// checklist, stage) stays on the task's own project board (linked
// below).

interface UnifiedTaskQuickEditProps {
  task: ProjectTask | null;
  members: AccountMember[];
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export function UnifiedTaskQuickEdit({ task, members, onClose, onSaved }: UnifiedTaskQuickEditProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setPriority(task.priority);
    setAssigneeIds(task.assignee_user_ids?.length ? task.assignee_user_ids : task.assignee_user_id ? [task.assignee_user_id] : []);
    setDueDate(task.due_date ?? "");
  }, [task]);

  async function handleSave() {
    if (!task) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("project_tasks")
        .update({
          title: trimmedTitle,
          priority,
          assignee_user_id: assigneeIds[0] ?? null,
          assignee_user_ids: assigneeIds,
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
            <Label className="text-muted-foreground">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-border bg-muted text-foreground" />
          </div>
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
            <Label className="text-muted-foreground">Assignees</Label>
            <MultiUserSelect members={members} value={assigneeIds} onChange={setAssigneeIds} />
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
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
