"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  ProjectTask,
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
import { Plus, Trash2, Paperclip, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Create/edit dialog for a project task. Handles the checklist
// inline (small JSON array, no separate table — see
// 041_client_projects.sql) and file attachments via direct
// client-side upload to the `task-attachments` Storage bucket,
// matching the app's existing avatar-upload pattern
// (src/components/settings/profile-form.tsx) rather than a server
// route.

interface TaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  projectId: string;
  stages: PipelineStage[];
  members: AccountMember[];
  /** null = creating a new task in `defaultStageId`; set = editing. */
  task: ProjectTask | null;
  defaultStageId: string | null;
  onSaved: () => void;
  onDeleted: () => void;
}

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export function TaskForm({
  open,
  onOpenChange,
  accountId,
  projectId,
  stages,
  members,
  task,
  defaultStageId,
  onSaved,
  onDeleted,
}: TaskFormProps) {
  const supabase = createClient();
  const isEditing = !!task;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stageId, setStageId] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>("__unassigned__");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState(task?.attachments ?? []);

 useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStageId(task?.stage_id ?? defaultStageId ?? stages[0]?.id ?? "");
    setAssigneeId(task?.assignee_user_id ?? "__unassigned__");
    setPriority(task?.priority ?? "normal");
    setDueDate(task?.due_date ?? "");
    setChecklist(task?.checklist ?? []);
    setAttachments(task?.attachments ?? []);
    setNewChecklistItem("");
  }, [open, task, defaultStageId, stages]);

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
      const res = await fetch(
        isEditing ? `/api/tasks/${task!.id}` : `/api/projects/${projectId}/tasks`,
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not save task.");
        return;
      }
      onOpenChange(false);
      onSaved();
      toast.success(isEditing ? "Task updated." : "Task created.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete task.");
        return;
      }
      onOpenChange(false);
      onDeleted();
      toast.success("Task deleted.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !task) return;

    setUploading(true);
    try {
      const path = `${accountId}/${task.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(path, file);
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }

      const { data: row, error: insertError } = await supabase
        .from("task_attachments")
        .insert({
          account_id: accountId,
          task_id: task.id,
          name: file.name,
          storage_path: path,
          file_size: file.size,
          mime_type: file.type || null,
        })
        .select()
        .single();

      if (insertError || !row) {
        toast.error("File uploaded but could not be recorded — try again.");
        return;
      }

      setAttachments([...attachments, row]);
      toast.success("File attached.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveAttachment(attachmentId: string, storagePath: string) {
    await supabase.storage.from("task-attachments").remove([storagePath]);
    await supabase.from("task_attachments").delete().eq("id", attachmentId);
    setAttachments(attachments.filter((a) => a.id !== attachmentId));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-popover border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {isEditing ? "Edit task" : "New task"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-border bg-muted text-foreground"
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border-border bg-muted text-foreground"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Column</Label>
                            <Select value={stageId} onValueChange={(v) => setStageId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">
                    {(value: string) =>
                      stages.find((s) => s.id === value)?.name ?? "Select a column"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[...stages]
                    .sort((a, b) => a.position - b.position)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
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
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
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
                      value === "__unassigned__"
                        ? "Unassigned"
                        : members.find((m) => m.user_id === value)?.full_name ?? "Unassigned"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Checklist</Label>
            <div className="space-y-1.5">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={() => toggleChecklistItem(i)}
                  />
                  <span
                    className={`flex-1 text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {item.text}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeChecklistItem(i)}
                    className="text-muted-foreground hover:text-red-400"
                  >
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addChecklistItem}
                disabled={!newChecklistItem.trim()}
                className="shrink-0 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Attachments</Label>
            {!isEditing ? (
              <p className="text-xs text-muted-foreground">
                Save the task first, then attach files.
              </p>
            ) : (
              <>
                {attachments.length > 0 && (
                  <div className="space-y-1.5">
                    {attachments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2 text-sm"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-foreground">{a.name}</span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRemoveAttachment(a.id, a.storage_path)}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                  {uploading ? "Uploading…" : "Attach a file"}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleFileUpload}
                  />
                </label>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="border-border bg-popover/50">
          {isEditing && (
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="mr-auto bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? "Deleting…" : "Delete task"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border bg-transparent text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim() || !stageId}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}