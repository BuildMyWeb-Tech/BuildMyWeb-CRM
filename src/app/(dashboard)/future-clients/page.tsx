"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Plus, Loader2, MoreVertical, Pencil, Trash2, ArrowUpRight, LayoutGrid, List as ListIcon, Users, Clock } from "lucide-react";
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
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem("future-clients-view") === "list" ? "list" : "grid";
  });

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

  const stats = useMemo(() => {
    const all = items ?? [];
    const thisMonth = all.filter((i) => {
      if (!i.created_at) return false;
      const d = new Date(i.created_at);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const withPhone = all.filter((i) => !!i.phone).length;
    return { total: all.length, thisMonth, withPhone };
  }, [items]);

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/20">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Future Clients</h1>
              <p className="text-sm text-slate-400">Leads parked here until they&apos;re ready to commit.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-[#2a3045] bg-[#1a1f2e] p-0.5">
              <button type="button" onClick={() => { setViewMode("grid"); localStorage.setItem("future-clients-view","grid"); }}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${viewMode === "grid" ? "bg-[#2a3045] text-white" : "text-slate-400 hover:text-white"}`}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => { setViewMode("list"); localStorage.setItem("future-clients-view","list"); }}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${viewMode === "list" ? "bg-[#2a3045] text-white" : "text-slate-400 hover:text-white"}`}>
                <ListIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {canCreate && (
              <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 text-white border-0">
                <Plus className="mr-1.5 h-4 w-4" />
                Add
              </Button>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/20 mb-3">
              <Users className="h-4 w-4 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-white">{items === null ? "—" : stats.total}</p>
            <p className="text-sm text-slate-400">Total</p>
          </div>
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 mb-3">
              <Clock className="h-4 w-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-white">{items === null ? "—" : stats.thisMonth}</p>
            <p className="text-sm text-slate-400">Added This Month</p>
          </div>
          <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/20 mb-3">
              <ArrowUpRight className="h-4 w-4 text-green-400" />
            </div>
            <p className="text-2xl font-bold text-white">{items === null ? "—" : stats.withPhone}</p>
            <p className="text-sm text-slate-400">With Phone</p>
          </div>
        </div>

        {/* List */}
        {items === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#2a3045] py-16 text-center">
            <p className="text-sm text-slate-500">Nothing here yet.</p>
            {canCreate && (
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add one
              </Button>
            )}
          </div>
        ) : viewMode === "list" ? (
          <div className="overflow-hidden rounded-xl border border-[#2a3045]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3045] bg-[#1a1f2e]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">Notes</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-[#2a3045] bg-[#1a1f2e] hover:bg-[#1e2436] transition-colors last:border-0">
                    <td className="px-4 py-3 font-medium text-white">{item.title}</td>
                    <td className="px-4 py-3 text-slate-400">{item.client_name || "—"}</td>
                    <td className="px-4 py-3">
                      {item.phone ? (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <span>{item.phone}</span>
                          <a href={whatsappLink(item.phone)} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400">
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 line-clamp-1 max-w-xs">{item.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-[#2a3045] hover:text-white">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdate && <DropdownMenuItem onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
                          {canDelete && <DropdownMenuItem onClick={() => handleDelete(item)} className="text-red-400 focus:text-red-400"><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="border-[#2a3045] bg-[#1a1f2e]">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base text-white">{item.title}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-[#2a3045]">
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
                {item.client_name && <p className="text-sm text-slate-300">{item.client_name}</p>}
                {item.phone && (
                  <div className="flex items-center gap-1.5 text-sm text-slate-400">
                    <span>{item.phone}</span>
                    <a href={whatsappLink(item.phone)} target="_blank" rel="noopener noreferrer" aria-label="Open in WhatsApp"
                      className="flex h-5 w-5 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
                {item.notes && <p className="line-clamp-3 text-xs text-slate-500">{item.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
        )}
      </div>

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
