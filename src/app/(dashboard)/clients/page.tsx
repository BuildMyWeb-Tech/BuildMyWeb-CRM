"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Client, ClientStatus } from "@/types";
import { toast } from "sonner";

const STATUS_STYLE: Record<ClientStatus, string> = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-amber-500/15 text-amber-500",
  archived: "bg-muted text-muted-foreground",
};

// Client Directory — the whole client relationship, from when they
// first became a client until now (or archived). Distinct from
// Sales `contacts` (leads) and Projects (one piece of active work) —
// a Project may optionally link back to a Client, but Clients exist
// independently.
export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadClients() {
    const res = await fetch("/api/clients");
    if (res.ok) {
      const data = await res.json();
      setClients(data.clients);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not create client.");
        return;
      }
      setDialogOpen(false);
      setName("");
      loadClients();
      toast.success("Client created.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Client Directory</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create client
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {clients ? `${clients.length} client${clients.length === 1 ? "" : "s"}` : "Loading…"} — the whole
        relationship, from when they started to now.
      </p>

      {clients === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : clients.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No clients yet.</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create your first client
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {c.client_since ? `Client since ${new Date(c.client_since).toLocaleDateString()}` : "No start date set"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Create client</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="border-border bg-muted text-foreground" autoFocus />
            </div>
            <p className="text-xs text-muted-foreground">
              Everything else (logo, interface contact, accent color, notes) can be filled in after — only a name is required.
            </p>
          </div>
          <DialogFooter className="border-border bg-popover/50">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
