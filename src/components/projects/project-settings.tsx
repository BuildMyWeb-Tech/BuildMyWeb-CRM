"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, ProjectStatus } from "@/types";
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
import { toast } from "sonner";

// Edit + delete for a project's own fields (name, client, status,
// dates, description) — the piece that was missing from Phase 2:
// PATCH/DELETE /api/projects/[id] existed from the start, but no UI
// ever called them. Usable from both /projects (list) and
// /projects/[id] (detail) — pass onDeleted only where the caller
// needs to navigate away afterward (the list page just removes the
// card; the detail page has to leave the page it's currently on).

const STATUSES: ProjectStatus[] = ["active", "on_hold", "completed", "cancelled"];

interface ProjectSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onSaved: (updated: Partial<Project>) => void;
  onDeleted: () => void;
}

export function ProjectSettings({
  open,
  onOpenChange,
  project,
  onSaved,
  onDeleted,
}: ProjectSettingsProps) {
  const router = useRouter();

  const [name, setName] = useState(project.name);
  const [clientName, setClientName] = useState(project.client_name ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [startDate, setStartDate] = useState(project.start_date ?? "");
  const [dueDate, setDueDate] = useState(project.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setClientName(project.client_name ?? "");
    setDescription(project.description ?? "");
    setStatus(project.status);
    setStartDate(project.start_date ?? "");
    setDueDate(project.due_date ?? "");
  }, [open, project]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaving(true);
    fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        client_name: clientName.trim() || null,
        description: description.trim() || null,
        status,
        start_date: startDate || null,
        due_date: dueDate || null,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          toast.error("Could not save changes.");
          return;
        }
        onOpenChange(false);
        onSaved({
          name: trimmedName,
          client_name: clientName.trim() || null,
          description: description.trim() || null,
          status,
          start_date: startDate || null,
          due_date: dueDate || null,
        });
        toast.success("Project updated.");
      })
      .catch(() => toast.error("Could not save changes."))
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${project.name}"? This deletes every task on its board too. This can't be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    fetch(`/api/projects/${project.id}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) {
          toast.error("Could not delete project.");
          return;
        }
        onOpenChange(false);
        onDeleted();
        toast.success("Project deleted.");
        router.push("/projects");
      })
      .catch(() => toast.error("Could not delete project."))
      .finally(() => setDeleting(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Project settings</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Project name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-border bg-muted text-foreground"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Client name (optional)</Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Not every project needs a linked contact"
              className="border-border bg-muted text-foreground"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue className="capitalize">
                  {(value: string) => value.replace("_", " ")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
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
            <Label className="text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border-border bg-muted text-foreground"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="border-border bg-popover/50">
          <Button
            onClick={handleDelete}
            disabled={deleting}
            className="mr-auto bg-red-600 text-white hover:bg-red-700"
          >
            {deleting ? "Deleting…" : "Delete project"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border bg-transparent text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}