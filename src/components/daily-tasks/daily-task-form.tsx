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
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import { resolveCommonStatusId } from "@/lib/kanban/resolve-common-status";
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
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [targetDate, setTargetDate] = useState("");
  const [showDate, setShowDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setBrief(task?.brief ?? "");
    setStageId(task?.stage_id ?? defaultStageId ?? stages[0]?.id ?? "");
    setClientId(task?.client_id ?? "__none__");
    setProjectId(task?.project_id ?? "__none__");
    setAssigneeIds(task?.assignee_user_ids?.length ? task.assignee_user_ids : task?.assignee_user_id ? [task.assignee_user_id] : []);
    setPriority(task?.priority ?? "normal");
    setTargetDate(task?.target_date ?? "");
    setShowDate(task?.show_date ?? "");
  }, [open, task, defaultStageId, stages]);

  // Keeps the mirrored `project_tasks` row (see
  // 064_daily_task_project_link.sql) in lockstep with this form's
  // fields whenever a Project is selected — that row is what makes
  // the task actually show up on that project's own board and the
  // unified cross-project Kanban, which only ever read project_tasks.
  // Returns the linked_project_task_id to persist on the daily_tasks
  // row (null if no project is selected, in which case any previous
  // mirror is deleted rather than left behind as a stale card).
  async function syncLinkedProjectTask(existingLinkId: string | null): Promise<string | null> {
    const trimmedTitle = title.trim();
    const resolvedAssignee = assigneeIds[0] ?? null;
    const resolvedDueDate = targetDate || null;

    if (projectId === "__none__") {
      if (existingLinkId) {
        await supabase.from("project_tasks").delete().eq("id", existingLinkId);
      }
      return null;
    }

    if (existingLinkId) {
      const { error } = await supabase
        .from("project_tasks")
        .update({ title: trimmedTitle, assignee_user_id: resolvedAssignee, assignee_user_ids: assigneeIds, priority, due_date: resolvedDueDate })
        .eq("id", existingLinkId);
      if (error) {
        console.error("[daily-tasks] linked project task update failed:", error);
        toast.error("Task saved, but couldn't update its project board card.");
      }
      return existingLinkId;
    }

    const project = projects.find((p) => p.id === projectId);
    if (!project) return null;

    const { data: firstStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", project.pipeline_id)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstStage) {
      toast.error("Task saved, but that project has no board columns yet — couldn't add it to the board.");
      return null;
    }

    const commonStatusId = await resolveCommonStatusId(supabase, accountId, firstStage.id);
    const { count } = await supabase
      .from("project_tasks")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", firstStage.id);

    const { data: newProjectTask, error } = await supabase
      .from("project_tasks")
      .insert({
        account_id: accountId,
        project_id: projectId,
        stage_id: firstStage.id,
        common_status_id: commonStatusId,
        title: trimmedTitle,
        assignee_user_id: resolvedAssignee,
        assignee_user_ids: assigneeIds,
        priority,
        due_date: resolvedDueDate,
        checklist: [],
        position: count ?? 0,
      })
      .select("id")
      .single();

    if (error || !newProjectTask) {
      console.error("[daily-tasks] linked project task creation failed:", error);
      toast.error("Task saved, but couldn't add it to the project board.");
      return null;
    }
    return newProjectTask.id;
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSaving(true);

    try {
      const linkedProjectTaskId = await syncLinkedProjectTask(task?.linked_project_task_id ?? null);

      const payload = {
        title: trimmedTitle,
        brief: brief.trim() || null,
        stage_id: stageId,
        client_id: clientId === "__none__" ? null : clientId,
        project_id: projectId === "__none__" ? null : projectId,
        assignee_user_id: assigneeIds[0] ?? null,
        assignee_user_ids: assigneeIds,
        priority,
        target_date: targetDate || null,
        show_date: showDate || null,
        linked_project_task_id: linkedProjectTaskId,
      };

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
      if (task.linked_project_task_id) {
        await supabase.from("project_tasks").delete().eq("id", task.linked_project_task_id);
      }
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
              <Label className="text-muted-foreground">Assignees</Label>
              <MultiUserSelect members={members} value={assigneeIds} onChange={setAssigneeIds} />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Target date</Label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="border-border bg-muted text-foreground" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Show date (optional — schedule for later)</Label>
            <Input type="date" value={showDate} onChange={(e) => setShowDate(e.target.value)} className="border-border bg-muted text-foreground" />
            <p className="text-xs text-muted-foreground">
              Hidden from the task list until this date — shows up under the &quot;Scheduled&quot; filter until then.
            </p>
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
