"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DailyTask, PipelineStage, AccountMember, Client, Project, TaskPriority } from "@/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { toast } from "sonner";

// Create/edit dialog for a Daily Task. Direct RLS-scoped writes to
// `daily_tasks` (no API route — matches Kanban/File Manager/Company
// Info). No fixed Designer/CTR/Impressions/Platform fields (removed
// per BMW — sector-specific stuff belongs in Custom Fields, not
// hardcoded columns).

interface DailyTaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  currentUserId: string;
  isAdmin: boolean;
  stages: PipelineStage[];
  members: AccountMember[];
  clients: Client[];
  projects: Project[];
  task: DailyTask | null;
  defaultStageId: string | null;
  onSaved: () => void;
  onDeleted: () => void;
}

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export function DailyTaskForm({
  open,
  onOpenChange,
  accountId,
  currentUserId,
  isAdmin,
  stages,
  members,
  clients,
  projects,
  task,
  defaultStageId,
  onSaved,
  onDeleted,
}: DailyTaskFormProps) {
  const supabase = createClient();
  const isEditing = !!task;

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [stageId, setStageId] = useState("");
  const [clientId, setClientId] = useState("__none__");
  const [projectId, setProjectId] = useState("__none__");
  const [assigneeId, setAssigneeId] = useState("__unassigned__");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setBrief(task?.brief ?? "");
    setStageId(task?.stage_id ?? defaultStageId ?? stages[0]?.id ?? "");
    setClientId(task?.client_id ?? "__none__");
    setProjectId(task?.project_id ?? "__none__");
    setAssigneeId(task?.assignee_user_id ?? "__unassigned__");
    setPriority(task?.priority ?? "normal");
    setTargetDate(task?.target_date ?? "");
  }, [open, task, defaultStageId, stages]);

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSaving(true);

    const payload = {
      title: trimmedTitle,
      brief: brief.trim() || null,
      stage_id: stageId,
      client_id: clientId === "__none__" ? null : clientId,
      project_id: projectId === "__none__" ? null : projectId,
      assignee_user_id: assigneeId === "__unassigned__" ? null : assigneeId,
      priority,
      target_date: targetDate || null,
    };

    try {
      if (isEditing) {
        const { error } = await supabase.from("daily_tasks").update(payload).eq("id", task!.id);
        if (error) {
          toast.error("Could not save task.");
          return;
        }
      } else {
        const { error } = await supabase.from("daily_tasks").insert({
          account_id: accountId,
          created_by: currentUserId,
          ...payload,
        });
        if (error) {
          toast.error("Could not create task.");
          return;
        }
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
      const { error } = await supabase.from("daily_tasks").delete().eq("id", task.id);
      if (error) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-popover border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{isEditing ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Task name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-border bg-muted text-foreground" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Client (optional)</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "__none__")}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">
                    {(v: string) => (v === "__none__" ? "None" : clients.find((c) => c.id === v)?.name ?? "None")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Project (optional)</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "__none__")}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">
                    {(v: string) => (v === "__none__" ? "None" : projects.find((p) => p.id === v)?.name ?? "None")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Instructions / Brief</Label>
            <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} className="border-border bg-muted text-foreground" rows={4} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Stage</Label>
              <Select value={stageId} onValueChange={(v) => setStageId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">
                    {(v: string) => stages.find((s) => s.id === v)?.name ?? "Select a stage"}
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
                  <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
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
              <Label className="text-muted-foreground">Target date</Label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="border-border bg-muted text-foreground" />
            </div>
          </div>

          <CustomFieldsSection
            accountId={accountId}
            currentUserId={currentUserId}
            entityType="daily_task"
            entityId={task?.id ?? null}
            isAdmin={isAdmin}
            canEdit={isEditing}
          />
        </div>

        <DialogFooter className="border-border bg-popover/50">
          {isEditing && (
            <Button onClick={handleDelete} disabled={deleting} className="mr-auto bg-red-600 text-white hover:bg-red-700">
              {deleting ? "Deleting…" : "Delete task"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim() || !stageId}>
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
