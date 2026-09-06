"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  type LucideIcon,
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
import type { AccountMember, MarketingCategory, MarketingItem, MarketingStatus } from "@/types";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { toast } from "sonner";

const STATUSES: MarketingStatus[] = ["planned", "in_progress", "done"];
const STATUS_LABEL: Record<MarketingStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  done: "Done",
};
const STATUS_STYLE: Record<MarketingStatus, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  done: "bg-emerald-500/15 text-emerald-500",
};

// Shared CRUD surface for all three Marketing sub-pages (Tele
// Calling / Content Creation / Paid Marketing) — same shape, just a
// different `category` + `pageKey`, same reasoning custom fields'
// `entity_type` uses: one component instead of three near-identical
// copies.
export function MarketingList({
  category,
  pageKey,
  title,
  icon: Icon,
}: {
  category: MarketingCategory;
  pageKey: string;
  title: string;
  icon: LucideIcon;
}) {
  const { canCreate, canUpdate, canDelete } = usePagePermissions(pageKey);
  const [items, setItems] = useState<MarketingItem[] | null>(null);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | MarketingStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MarketingItem | null>(null);

  async function load() {
    const [itemsRes, membersRes] = await Promise.all([
      fetch(`/api/marketing-items?category=${category}`),
      fetch("/api/account/members"),
    ]);
    if (itemsRes.ok) setItems((await itemsRes.json()).items ?? []);
    if (membersRes.ok) setMembers((await membersRes.json()).members ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const visible = (items ?? []).filter((i) => statusFilter === "all" || i.status === statusFilter);

  async function handleDelete(item: MarketingItem) {
    if (!window.confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/marketing-items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete.");
      return;
    }
    load();
    toast.success("Deleted.");
  }

  function openEdit(item: MarketingItem) {
    setEditTarget(item);
    setFormOpen(true);
  }

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            New item
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {items ? `${items.length} item${items.length === 1 ? "" : "s"}` : "Loading…"}
      </p>

      <div className="mt-4 flex items-center gap-1.5">
        {(["all", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {items.length === 0 ? "No items yet." : "Nothing matches this filter."}
          </p>
          {canCreate && items.length === 0 && (
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add your first item
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border">
          {visible.map((item) => {
            const assigned = members.find((m) => m.user_id === item.assigned_user_id);
            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  {item.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
                </div>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {assigned?.full_name || "Unassigned"}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {item.item_date ? new Date(item.item_date).toLocaleDateString() : "—"}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
                {(canUpdate || canDelete) && (
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
                )}
              </div>
            );
          })}
        </div>
      )}

      <MarketingItemDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editTarget}
        category={category}
        members={members}
        onSaved={load}
      />
    </div>
  );
}

function MarketingItemDialog({
  open,
  onOpenChange,
  initial,
  category,
  members,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: MarketingItem | null;
  category: MarketingCategory;
  members: AccountMember[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<MarketingStatus>("planned");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [itemDate, setItemDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setStatus(initial?.status ?? "planned");
    setAssignedUserId(initial?.assigned_user_id ?? "");
    setItemDate(initial?.item_date ?? "");
  }, [open, initial]);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const payload = {
        category,
        title: trimmed,
        description: description.trim() || null,
        status,
        assigned_user_id: assignedUserId || null,
        item_date: itemDate || null,
      };
      const res = await fetch(initial ? `/api/marketing-items/${initial.id}` : "/api/marketing-items", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not save this item.");
        return;
      }
      onOpenChange(false);
      onSaved();
      toast.success(initial ? "Item updated." : "Item added.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-popover border-border max-h-[88vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{initial ? `Edit ${initial.title}` : "New item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-border bg-muted text-foreground" autoFocus />
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="border-border bg-muted text-foreground" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as MarketingStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">{(v: string) => STATUS_LABEL[v as MarketingStatus] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Assigned to</Label>
              <Select value={assignedUserId || "__none"} onValueChange={(v) => setAssignedUserId(v === "__none" ? "" : (v ?? ""))}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">
                    {(v: string) => (v === "__none" ? "Unassigned" : members.find((m) => m.user_id === v)?.full_name ?? "Unassigned")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Date</Label>
            <Input type="date" value={itemDate} onChange={(e) => setItemDate(e.target.value)} className="border-border bg-muted text-foreground" />
          </div>
        </div>
        <DialogFooter className="border-border bg-popover/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : initial ? "Save" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
