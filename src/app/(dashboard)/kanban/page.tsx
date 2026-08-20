"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { KanbanBoard } from "@/types";
import { toast } from "sonner";

// Standalone Kanban — ad-hoc boards not tied to any project or
// client, for internal planning. Same create-flow shape as Projects
// (POST seeds the board + 3 default columns in one call).
export default function KanbanPage() {
  const [boards, setBoards] = useState<KanbanBoard[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadBoards() {
    const res = await fetch("/api/kanban-boards");
    if (res.ok) {
      const data = await res.json();
      setBoards(data.boards);
    }
  }

  useEffect(() => {
    loadBoards();
  }, []);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/kanban-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description: description.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not create board.");
        return;
      }
      setDialogOpen(false);
      setName("");
      setDescription("");
      loadBoards();
      toast.success("Board created.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Kanban</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New board
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ad-hoc boards for internal planning — not tied to a project or client.
      </p>

      {boards === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : boards.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No boards yet.</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create your first board
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <Link key={b.id} href={`/kanban/${b.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="text-base">{b.name}</CardTitle>
                </CardHeader>
                {b.description && (
                  <CardContent>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{b.description}</p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">New board</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Board name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="border-border bg-muted text-foreground" autoFocus />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="border-border bg-muted text-foreground" rows={3} />
            </div>
          </div>
          <DialogFooter className="border-border bg-popover/50">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
