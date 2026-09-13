"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users, Plus, Loader2, MoreVertical, Pencil, Trash2,
  List as ListIcon, LayoutGrid, Search, AlertTriangle,
  Archive, ChevronRight, Home,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Client, ClientStatus } from "@/types";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

async function fetchClients(): Promise<Client[]> {
  const res = await fetch("/api/clients");
  if (!res.ok) throw new Error("Could not load clients");
  return (await res.json()).clients ?? [];
}

const STATUSES: ClientStatus[] = ["active", "inactive", "archived"];

// Client Directory — the whole client relationship, from when they
// first became a client until now (or archived). Distinct from
// Sales `contacts` (leads) and Projects (one piece of active work) —
// a Project may optionally link back to a Client, but Clients exist
// independently.

const AVATAR_COLORS = [
  "bg-purple-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-red-500",
  "bg-teal-500",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function StatusBadge({ status }: { status: ClientStatus }) {
  if (status === "active")
    return (
      <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
        Active
      </span>
    );
  if (status === "inactive")
    return (
      <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
        Inactive
      </span>
    );
  return (
    <span className="rounded-full bg-slate-600/20 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
      Archived
    </span>
  );
}


export default function ClientsPage() {
  const { canCreate, canUpdate, canDelete } = usePagePermissions("client_directory");
  const { accountId } = useAuth();
  const { data: clients, refresh: loadClients } = useCachedResource(
    accountId ? `clients-list:${accountId}` : null,
    fetchClients,
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem("clients-view") === "list" ? "list" : "grid";
  });
  const [statusFilter, setStatusFilter] = useState<"all" | ClientStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ClientStatus>("active");
  const [interfaceName, setInterfaceName] = useState("");
  const [interfaceNumber, setInterfaceNumber] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [clientSince, setClientSince] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

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

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          status,
          interface_name: interfaceName.trim() || null,
          interface_contact_number: interfaceNumber.trim() || null,
          accent_color: accentColor.trim() || null,
          client_since: clientSince || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not create client.");
        return;
      }
      setCreateOpen(false);
      setName("");
      setStatus("active");
      setInterfaceName("");
      setInterfaceNumber("");
      setAccentColor("");
      setClientSince("");
      setNotes("");
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

  const allClients = clients ?? [];
  const totalCount = allClients.length;
  const activeCount = allClients.filter((c) => c.status === "active").length;
  const atRiskCount = allClients.filter((c) => c.status === "inactive").length;
  const archivedCount = allClients.filter((c) => c.status === "archived").length;

  const visibleClients = allClients.filter((c) => {
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesSearch =
      !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="flex min-h-screen bg-[#0f1117]">
      {/* Main content */}
      <div className="flex-1 min-w-0 p-6 pr-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
          <Home className="h-3 w-3" />
          <span>Home</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-300">Clients</span>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Client Directory</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your clients, track relationships and never miss a follow-up.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total Clients */}
          <div className="bg-[#1a1f2e] border border-[#2a3045] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Clients</span>
              <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Users className="h-4 w-4 text-purple-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {clients === null ? "—" : totalCount}
            </div>
          </div>

          {/* Active */}
          <div className="bg-[#1a1f2e] border border-[#2a3045] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Active</span>
              <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <span className="h-2.5 w-2.5 rounded-full bg-green-400 block" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {clients === null ? "—" : activeCount}
            </div>
          </div>

          {/* Inactive */}
          <div className="bg-[#1a1f2e] border border-[#2a3045] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Inactive</span>
              <div className="h-8 w-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {clients === null ? "—" : atRiskCount}
            </div>
          </div>

          {/* Archived */}
          <div className="bg-[#1a1f2e] border border-[#2a3045] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Archived</span>
              <div className="h-8 w-8 rounded-lg bg-slate-500/20 flex items-center justify-center">
                <Archive className="h-4 w-4 text-slate-400" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {clients === null ? "—" : archivedCount}
            </div>
            <div className="text-xs text-slate-500">no change</div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {canCreate && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Create client
            </Button>
          )}

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-[#1a1f2e] border border-[#2a3045] rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | ClientStatus)}
            className="px-3 py-1.5 text-sm bg-[#1a1f2e] border border-[#2a3045] rounded-lg text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>

          <select
            className="px-3 py-1.5 text-sm bg-[#1a1f2e] border border-[#2a3045] rounded-lg text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option>All Owners</option>
          </select>

          <select
            className="px-3 py-1.5 text-sm bg-[#1a1f2e] border border-[#2a3045] rounded-lg text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option>Recently Updated</option>
          </select>

          <div className="flex items-center rounded-lg border border-[#2a3045] bg-[#1a1f2e] p-0.5 ml-auto">
            <button
              type="button"
              onClick={() => changeViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-[#2a3045] text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-[#2a3045] text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Client list / grid */}
        {clients === null ? (
          <div className="mt-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : clients.length === 0 ? (
          <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#2a3045] py-16 text-center">
            <Users className="h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-500">No clients yet.</p>
            {canCreate && (
              <button
                onClick={() => setCreateOpen(true)}
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 hover:bg-[#2a3045]"
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first client
              </button>
            )}
          </div>
        ) : visibleClients.length === 0 ? (
          <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#2a3045] py-16 text-center">
            <p className="text-sm text-slate-500">No clients match this filter.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleClients.map((c, idx) => (
              <ClientCard
                key={c.id}
                client={c}
                idx={idx}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onEdit={(e) => openQuickEdit(c, e)}
                onDelete={(e) => handleDelete(c, e)}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-[#2a3045] rounded-xl border border-[#2a3045] bg-[#1a1f2e]">
            {visibleClients.map((c) => (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#2a3045]/50 transition-colors"
              >
                <div
                  className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white ${getAvatarColor(c.name)}`}
                >
                  {getInitials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.client_since
                      ? `Client since ${new Date(c.client_since).toLocaleDateString()}`
                      : "No start date set"}
                  </p>
                </div>
                <StatusBadge status={c.status} />
                <ClientCardMenu
                  onEdit={(e) => openQuickEdit(c, e)}
                  onDelete={(e) => handleDelete(c, e)}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                />
              </Link>
            ))}
          </div>
        )}
      </div>


      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Create client</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-border bg-muted text-foreground"
                autoFocus
              />
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Interface contact name</Label>
                <Input
                  value={interfaceName}
                  onChange={(e) => setInterfaceName(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Interface contact number</Label>
                <Input
                  value={interfaceNumber}
                  onChange={(e) => setInterfaceNumber(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Client since</Label>
                <Input
                  type="date"
                  value={clientSince}
                  onChange={(e) => setClientSince(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Accent color</Label>
                <Input
                  type="color"
                  value={accentColor || "#3b82f6"}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 border-border bg-muted p-1"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border-border bg-muted text-foreground"
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Logo can be uploaded after creation, from the client&apos;s own page. A matching project + task board gets created automatically.
            </p>
          </div>
          <DialogFooter className="border-border bg-popover/50">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Edit {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
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
                <Input
                  value={editInterfaceName}
                  onChange={(e) => setEditInterfaceName(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Interface contact number</Label>
                <Input
                  value={editInterfaceNumber}
                  onChange={(e) => setEditInterfaceNumber(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="border-border bg-muted text-foreground"
                rows={2}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Logo, accent color, and Scope of Work live on the full client page — this is the quick-edit set.
            </p>
          </div>
          <DialogFooter className="border-border bg-popover/50">
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
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

function ClientCard({
  client: c,
  idx,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  client: Client;
  idx: number;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const avatarColor = c.accent_color ? undefined : getAvatarColor(c.name);
  const progressPct = Math.min(100, ((idx * 37 + 20) % 80) + 10); // deterministic fake progress

  return (
    <Link href={`/clients/${c.id}`}>
      <div className="bg-[#1a1f2e] border border-[#2a3045] rounded-xl p-4 hover:border-blue-500/40 transition-colors cursor-pointer h-full flex flex-col">
        {/* Top row: avatar + name + status + menu */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white ${avatarColor ?? ""}`}
            style={c.accent_color ? { backgroundColor: c.accent_color } : undefined}
          >
            {getInitials(c.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-semibold text-white truncate">{c.name}</p>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-xs text-slate-400 truncate">
              {c.notes ? c.notes.split(" ").slice(0, 4).join(" ") : "No industry set"}
            </p>
          </div>
          <ClientCardMenu
            onEdit={onEdit}
            onDelete={onDelete}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        </div>

        {/* Details */}
        <div className="flex flex-col gap-1.5 mb-3 flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Owner</span>
            <span className="text-slate-300">—</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Contact</span>
            <span className="text-slate-300 truncate max-w-[130px]">
              {c.interface_name || "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Last activity</span>
            <span className="text-slate-300">
              {c.client_since
                ? new Date(c.client_since).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Next follow-up</span>
            <span className="text-slate-300">—</span>
          </div>
        </div>

        {/* Footer: projects + progress */}
        <div className="border-t border-[#2a3045] pt-3 mt-auto">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-400">Projects <span className="text-blue-400">1 active</span></span>
            <span className="text-slate-400">Est. Value <span className="text-slate-200">—</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[#2a3045]">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 shrink-0">{progressPct}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ClientCardMenu({
  onEdit,
  onDelete,
  canUpdate,
  canDelete,
}: {
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  if (!canUpdate && !canDelete) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-[#2a3045] hover:text-slate-300"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {canUpdate && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
