"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, List as ListIcon, Loader2, Plus, Search } from "lucide-react";
import type { Client, ClientStatus } from "@/types";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useAuth } from "@/hooks/use-auth";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { toast } from "sonner";

// Reusable client list — same data as /clients but no page header/stats.
// Used by the dashboard "Clients" tab and can be imported anywhere.

const AVATAR_COLORS = [
  "bg-purple-500","bg-blue-500","bg-green-500","bg-yellow-500",
  "bg-pink-500","bg-indigo-500","bg-red-500","bg-teal-500",
];
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) { return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join(""); }

function StatusBadge({ status }: { status: ClientStatus }) {
  if (status === "active") return <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">Active</span>;
  if (status === "inactive") return <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Inactive</span>;
  return <span className="rounded-full bg-slate-600/20 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Archived</span>;
}

async function fetchClients(): Promise<Client[]> {
  const res = await fetch("/api/clients");
  if (!res.ok) throw new Error("Could not load clients");
  return (await res.json()).clients ?? [];
}

export function ClientsEmbedView() {
  const { accountId } = useAuth();
  const { canCreate } = usePagePermissions("client_directory");
  const { data: clients, loading, refresh } = useCachedResource(
    accountId ? `clients-list:${accountId}` : null,
    fetchClients,
  );

  const [view, setView] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem("clients-view") === "list" ? "list" : "grid";
  });
  const [statusFilter, setStatusFilter] = useState<"all" | ClientStatus>("all");
  const [search, setSearch] = useState("");

  // Quick create
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, status: "active" }),
      });
      if (!res.ok) { toast.error("Could not create client"); return; }
      setCreateOpen(false);
      setName("");
      refresh();
      toast.success("Client created");
    } finally { setCreating(false); }
  }

  const filtered = (clients ?? []).filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="h-8 w-full rounded-lg border border-border bg-muted pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | ClientStatus)}
          className="h-8 rounded-lg border border-border bg-muted px-2 text-xs text-foreground focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button type="button" onClick={() => { setView("grid"); window.localStorage.setItem("clients-view", "grid"); }}
            className={`px-2.5 py-1.5 ${view === "grid" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => { setView("list"); window.localStorage.setItem("clients-view", "list"); }}
            className={`px-2.5 py-1.5 ${view === "list" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            <ListIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        {canCreate && (
          <button type="button" onClick={() => setCreateOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> New Client
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {search || statusFilter !== "all" ? "No clients match this filter." : "No clients yet — create one above."}
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${avatarColor(c.name)} text-sm font-bold text-white`}>
                  {initials(c.name)}
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm text-foreground">{c.name}</p>
                {c.interface_name && <p className="truncate text-[11px] text-muted-foreground">{c.interface_name}</p>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Client</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Contact</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5 hover:underline">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${avatarColor(c.name)} text-[10px] font-bold text-white`}>
                        {initials(c.name)}
                      </div>
                      <span className="font-medium text-foreground">{c.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.interface_name ?? c.interface_contact_number ?? "—"}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick create dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="mb-4 text-sm font-semibold text-foreground">New Client</h2>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreateOpen(false); }}
              placeholder="Client name"
              className="mb-4 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button type="button" onClick={handleCreate} disabled={creating || !name.trim()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90">
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
