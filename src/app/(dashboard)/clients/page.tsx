"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, Loader2, MoreVertical, Pencil, Trash2, List as ListIcon, LayoutGrid } from "lucide-react";
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
import type { Client, ClientStatus } from "@/types";
import { toast } from "sonner";

const STATUSES: ClientStatus[] = ["active", "inactive", "archived"];
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
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem("clients-view") === "list" ? "list" : "grid";
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ClientStatus>("active");
  const [creating, setCreating] = useState(false);

  // Quick-edit — the "edit it like Info simply from the 3-dot" ask.
  // Covers the everyday-editable fields; logo/accent color stay on
  // the full detail page since they need more room (image upload,
  // color swatches) than a quick dialog should try to fit.
  const [editTarget, setEditTarget] = useState<Client | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<ClientStatus>("active");
  const [editInterfaceName, setEditInterfaceName] = useState("");
  const [editInterfaceNumber, setEditInterfaceNumber] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function changeViewMode(mode: "grid" | "list") {
    setViewMode(mode);
    window.localStorage.setItem("clients-view", mode);
  }

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
        body: JSON.stringify({ name: trimmed, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not create client.");
        return;
      }
      setCreateOpen(false);
      setName("");
      setStatus("active");
      loadClients();
      toast.success("Client created — a matching project was set up for it too.");
    } finally {
      setCreating(false);
    }
  }

  function openQuickEdit(c: Client, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditTarget(c);
    setEditName(c.name);
    setEditStatus(c.status);
    setEditInterfaceName(c.interface_name ?? "");
    setEditInterfaceNumber(c.interface_contact_number ?? "");
    setEditNotes(c.notes ?? "");
  }

  async function handleQuickSave() {
    if (!editTarget || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          status: editStatus,
          interface_name: editInterfaceName.trim() || null,
          interface_contact_number: editInterfaceNumber.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        toast.error("Could not save.");
        return;
      }
      setEditTarget(null);
      loadClients();
      toast.success("Client updated.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Client, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${c.name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/clients/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete client.");
      return;
    }
    loadClients();
    toast.success("Client deleted.");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Client Directory</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => changeViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              className={`flex h-7 w-8 items-center justify-center rounded-md ${
                viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`flex h-7 w-8 items-center justify-center rounded-md ${
                viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create client
          </Button>
        </div>
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
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create your first client
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`}>
              <Card
                className="h-full border-l-4 transition-colors hover:border-primary/40"
                style={c.accent_color ? { borderLeftColor: c.accent_color } : undefined}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[c.status]}`}>
                        {c.status}
                      </span>
                      <ClientCardMenu onEdit={(e) => openQuickEdit(c, e)} onDelete={(e) => handleDelete(c, e)} />
                    </div>
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
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex items-center gap-3 border-l-4 px-4 py-3 hover:bg-muted/50"
              style={{ borderLeftColor: c.accent_color || "transparent" }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.client_since ? `Client since ${new Date(c.client_since).toLocaleDateString()}` : "No start date set"}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[c.status]}`}>
                {c.status}
              </span>
              <ClientCardMenu onEdit={(e) => openQuickEdit(c, e)} onDelete={(e) => handleDelete(c, e)} />
            </Link>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Create client</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="border-border bg-muted text-foreground" autoFocus />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as ClientStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Everything else (logo, interface contact, accent color, notes) can be filled in after — only a name is required. A matching project + task board gets created automatically.
            </p>
          </div>
          <DialogFooter className="border-border bg-popover/50">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick edit dialog — the 3-dot "Edit" action */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Edit {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="border-border bg-muted text-foreground" />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Status</Label>
              <Select value={editStatus} onValueChange={(v) => v && setEditStatus(v as ClientStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Client interface name</Label>
                <Input value={editInterfaceName} onChange={(e) => setEditInterfaceName(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Interface contact number</Label>
                <Input value={editInterfaceNumber} onChange={(e) => setEditInterfaceNumber(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="border-border bg-muted text-foreground" rows={2} />
            </div>
            <p className="text-xs text-muted-foreground">
              Logo, accent color, and Scope of Work live on the full client page — this is the quick-edit set.
            </p>
          </div>
          <DialogFooter className="border-border bg-popover/50">
            <Button variant="outline" onClick={() => setEditTarget(null)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleQuickSave} disabled={saving || !editName.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientCardMenu({
  onEdit,
  onDelete,
}: {
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
