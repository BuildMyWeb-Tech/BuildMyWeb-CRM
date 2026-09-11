"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KanbanSquare, Plus, MoreVertical, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ProjectSettings } from "@/components/projects/project-settings";
import type { Project, ProjectStatus } from "@/types";
import { toast } from "sonner";

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

  const statCounts = {
    all: (projects ?? []).length,
    active: (projects ?? []).filter((p) => p.status === "active").length,
    inactive: (projects ?? []).filter((p) => p.status === "inactive").length,
    archived: (projects ?? []).filter((p) => p.status === "archived").length,
  };

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="space-y-6 p-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="mt-0.5 text-sm text-slate-400">Each project gets its own task board.</p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["all", "active", "inactive", "archived"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s === "all" ? "all" : s)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                statusFilter === s || (s === "all" && statusFilter === "all")
                  ? "border-blue-500/50 bg-blue-500/10"
                  : "border-[#2a3045] bg-[#1a1f2e] hover:border-[#3a4055]"
              }`}>
              <p className="text-2xl font-bold text-white">{statCounts[s]}</p>
              <p className="text-xs capitalize text-slate-400">{s === "all" ? "Total Projects" : `${s} Projects`}</p>
            </button>
          ))}
        </div>

        {/* Project grid */}
        {projects === null ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#2a3045] py-20 text-center">
            <KanbanSquare className="h-10 w-10 text-slate-700" />
            <p className="text-slate-400">No projects yet</p>
            <button type="button" onClick={() => setDialogOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-4 py-2 text-sm text-slate-300 hover:border-blue-500/50 transition-colors">
              <Plus className="h-4 w-4" /> Create your first project
            </button>
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[#2a3045]">
            <p className="text-sm text-slate-500">No projects match this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProjects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="group rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5 hover:border-blue-500/40 hover:bg-[#1e2436] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                    <KanbanSquare className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${
                      p.status === "active" ? "border-green-500/30 bg-green-500/20 text-green-400"
                      : p.status === "inactive" ? "border-amber-500/30 bg-amber-500/20 text-amber-400"
                      : "border-[#2a3045] bg-[#2a3045] text-slate-500"
                    }`}>{p.status}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-[#2a3045] hover:text-white transition-colors"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingProject(p); }}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors">{p.name}</h3>
                  <p className="mt-0.5 text-sm text-slate-500">{p.contact?.name || p.client_name || "No client linked"}</p>
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500">{p.description}</p>
                  )}
                </div>
                {typeof p.progress_percentage === "number" && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Progress</span>
                      <span className="text-[11px] font-semibold text-white">{p.progress_percentage}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a3045]">
                      <div className={`h-full rounded-full transition-all ${
                        p.progress_percentage >= 75 ? "bg-green-500"
                        : p.progress_percentage >= 40 ? "bg-blue-500"
                        : "bg-amber-500"
                      }`} style={{ width: `${p.progress_percentage}%` }} />
                    </div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md border-[#2a3045] bg-[#1a1f2e]">
          <DialogHeader>
            <DialogTitle className="text-white">New Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-slate-400">Project name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                className="border-[#2a3045] bg-[#0f1117] text-white placeholder:text-slate-600 focus:border-blue-500" autoFocus />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-400">Client name (optional)</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)}
                placeholder="Not every project needs a linked contact"
                className="border-[#2a3045] bg-[#0f1117] text-white placeholder:text-slate-600 focus:border-blue-500" />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-400">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                className="border-[#2a3045] bg-[#0f1117] text-white placeholder:text-slate-600 focus:border-blue-500" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}
              className="border-[#2a3045] bg-transparent text-slate-400 hover:bg-[#2a3045] hover:text-white">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()} className="bg-blue-600 hover:bg-blue-500">
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
