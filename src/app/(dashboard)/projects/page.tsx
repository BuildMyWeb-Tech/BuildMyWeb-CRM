"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KanbanSquare, Plus } from "lucide-react";
import {
  Folder,
  File as FileIcon,
  FolderPlus,
  Upload,
  MoreVertical,
  Pencil,
  Trash2,
  Link2,
  Globe,
  Lock,
  Download,
  Eye,
  ChevronRight,
  Home,
  Loader2,
  List as ListIcon,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectSettings } from "@/components/projects/project-settings";
import type { Project, ProjectStatus } from "@/types";
import { toast } from "sonner";

// Same 3 values and the same styling as Client Directory's own
// STATUS_STYLE (src/app/(dashboard)/clients/page.tsx) — the two are
// interlinked (065_unify_project_client_status.sql), so they should
// look interlinked too, not just share a data model.
const STATUSES: ProjectStatus[] = ["active", "inactive", "archived"];
const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-amber-500/15 text-amber-500",
  archived: "bg-muted text-muted-foreground",
};

// Projects list — client projects each get their own task board
// (see [id]/page.tsx). New-project dialog creates the project and
// its board in one call (POST /api/projects seeds 4 default
// columns automatically).
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");

  async function loadProjects() {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      setProjects(data.projects);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          client_name: clientName.trim() || null,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not create project.");
        return;
      }
      setDialogOpen(false);
      setName("");
      setClientName("");
      setDescription("");
      loadProjects();
      toast.success("Project created.");
    } finally {
      setCreating(false);
    }
  }

  const visibleProjects = (projects ?? []).filter((p) => statusFilter === "all" || p.status === statusFilter);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KanbanSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Projects
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as "all" | ProjectStatus)}>
            <SelectTrigger size="sm">
              <SelectValue className="truncate capitalize">
                {(v: string) => (v === "all" ? "Status: All" : `Status: ${v.charAt(0).toUpperCase()}${v.slice(1)}`)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">Status: All</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New project
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Each project gets its own task board. Not every project needs a
        linked contact — type a client name if it&apos;s not in your Sales
        contacts.
      </p>

      {projects === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No projects yet.</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create your first project
          </Button>
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No projects match this filter.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[p.status]}`}
                      >
                        {p.status.replace("_", " ")}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditingProject(p);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {p.contact?.name || p.client_name || "No client linked"}
                  </p>
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  {typeof p.progress_percentage === "number" && p.progress_percentage > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Progress</span>
                        <span className="text-[10px] font-medium text-foreground">{p.progress_percentage}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${p.progress_percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">New project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Project name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-border bg-muted text-foreground"
                autoFocus
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
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingProject && (
        <ProjectSettings
          open={!!editingProject}
          onOpenChange={(open) => !open && setEditingProject(null)}
          project={editingProject}
          onSaved={(updated) => {
            setProjects((prev) =>
              prev
                ? prev.map((proj) =>
                    proj.id === editingProject.id ? { ...proj, ...updated } : proj,
                  )
                : prev,
            );
            setEditingProject(null);
          }}
          onDeleted={() => {
            setProjects((prev) => prev?.filter((proj) => proj.id !== editingProject.id) ?? prev);
            setEditingProject(null);
          }}
        />
      )}
    </div>
  );
}