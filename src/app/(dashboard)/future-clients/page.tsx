"use client";

import { useEffect, useState } from "react";
import { Sparkles, Plus, Loader2, MoreVertical, Pencil, Trash2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { whatsappLink } from "@/components/client-leads/lead-shared";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import type { FutureClient } from "@/types";
import { toast } from "sonner";

// Client Enquiry's 4th outcome — "maybe later," a lead that's not a
// no (Reject) but not ready (Hold) either. Moved here from Client
// Enquiry (POST /api/client-leads/[id]/future) or added directly.
export default function FutureClientsPage() {
  const { canCreate, canUpdate, canDelete } = usePagePermissions("future_clients");
  const [items, setItems] = useState<FutureClient[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FutureClient | null>(null);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/future-clients");
    if (res.ok) setItems((await res.json()).futureClients ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditTarget(null);
    setTitle("");
    setClientName("");
    setPhone("");
    setNotes("");
    setFormOpen(true);
  }

  function openEdit(item: FutureClient) {
    setEditTarget(item);
    setTitle(item.title);
    setClientName(item.client_name ?? "");
    setPhone(item.phone ?? "");
    setNotes(item.notes ?? "");
    setFormOpen(true);
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const payload = { title: trimmed, client_name: clientName.trim() || null, phone: phone.trim() || null, notes: notes.trim() || null };
      const res = await fetch(editTarget ? `/api/future-clients/${editTarget.id}` : "/api/future-clients", {
        method: editTarget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error("Could not save.");
        return;
      }
      setFormOpen(false);
      load();
      toast.success(editTarget ? "Updated." : "Added.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: FutureClient) {
    if (!window.confirm(`Remove "${item.title}" from Future Clients?`)) return;
    const res = await fetch(`/api/future-clients/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete.");
      return;
    }
    load();
    toast.success("Removed.");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Future Clients</h1>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Leads that aren&apos;t a yes yet, but aren&apos;t a no either — parked here until they&apos;re ready.
      </p>

      {items === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          {canCreate && (
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add one
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canUpdate && (
                        <DropdownMenuItem onClick={() => openEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-400 focus:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {item.client_name && <p className="text-sm text-foreground">{item.client_name}</p>}
                {item.phone && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>{item.phone}</span>
                    <a
                      href={whatsappLink(item.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open in WhatsApp"
                      className="flex h-5 w-5 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
                {item.notes && <p className="line-clamp-3 text-xs text-muted-foreground">{item.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{editTarget ? "Edit" : "Add future client"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-border bg-muted text-foreground" autoFocus />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Client name</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="border-border bg-muted text-foreground" />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Phone number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 90000 00000" className="border-border bg-muted text-foreground" />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="border-border bg-muted text-foreground" rows={3} />
            </div>
          </div>
          <DialogFooter className="border-border bg-popover/50">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? "Saving…" : editTarget ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
