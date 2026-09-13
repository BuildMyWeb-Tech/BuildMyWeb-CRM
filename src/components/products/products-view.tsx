"use client";

import { useEffect, useState } from "react";
import {
  Package,
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Eye,
  EyeOff,
  X,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
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
import { FileManager } from "@/components/files/file-manager";
import type { Product, ProductCredential, ProductPriority, ProductStageTag } from "@/types";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

// The Products page's body — extracted so it can be reused as-is on
// the Overview page's "Products" tab (same data, same component, not
// a lookalike). Product — a flat internal registry of BMW's own/
// client products: what it's for, where it lives, what it's built
// with. Distinct from Client Directory (a relationship) and Projects
// (a piece of active work) — a product can predate or outlive either.

export const STAGE_TAGS: ProductStageTag[] = ["idea", "planning", "development", "deployment", "testing", "launch", "sales"];
export const STAGE_TAG_LABEL: Record<ProductStageTag, string> = {
  idea: "Idea",
  planning: "Planning",
  development: "Development",
  deployment: "Deployment",
  testing: "Testing",
  launch: "Launch",
  sales: "Sales",
};
export const PRIORITIES: ProductPriority[] = ["high", "urgent", "medium", "low", "hold"];
export const PRIORITY_STYLE: Record<ProductPriority, string> = {
  high: "bg-amber-500/15 text-amber-500",
  urgent: "bg-red-500/15 text-red-400",
  medium: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
  hold: "bg-purple-500/15 text-purple-400",
};

export function ProductsView() {
  const { accountId, user } = useAuth();
  const { canCreate, canUpdate, canDelete } = usePagePermissions("products");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<Set<ProductStageTag>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [docsOpenId, setDocsOpenId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem("products-view") === "list" ? "list" : "grid";
  });

  async function load() {
    const res = await fetch("/api/products");
    if (res.ok) setProducts((await res.json()).products ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function toggleStageFilter(tag: ProductStageTag) {
    setStageFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  const visible = (products ?? []).filter((p) => {
    if (stageFilter.size > 0 && !p.stage_tags.some((t) => stageFilter.has(t))) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return `${p.project_name} ${p.purpose ?? ""} ${p.tech_stack ?? ""}`.toLowerCase().includes(q);
  });

  async function handleDelete(p: Product) {
    if (!window.confirm(`Delete "${p.project_name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete product.");
      return;
    }
    load();
    toast.success("Product deleted.");
  }

  function openEdit(p: Product) {
    setEditTarget(p);
    setFormOpen(true);
  }

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  const allProducts = products ?? [];
  const activeProducts = allProducts.filter((p) => !p.stage_tags.includes("launch") && !p.stage_tags.includes("sales"));
  const inDev = allProducts.filter((p) => p.stage_tags.includes("development"));
  const launched = allProducts.filter((p) => p.stage_tags.includes("launch") || p.stage_tags.includes("sales"));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Products</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
            <button type="button" onClick={() => { setViewMode("grid"); localStorage.setItem("products-view","grid"); }}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${viewMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => { setViewMode("list"); localStorage.setItem("products-view","list"); }}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New product
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-bold text-foreground">{products === null ? "—" : allProducts.length}</p>
          <p className="text-sm text-muted-foreground">Total Products</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-bold text-foreground">{products === null ? "—" : inDev.length}</p>
          <p className="text-sm text-muted-foreground">In Development</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-bold text-foreground">{products === null ? "—" : launched.length}</p>
          <p className="text-sm text-muted-foreground">Launched</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xl font-bold text-foreground">{products === null ? "—" : activeProducts.length}</p>
          <p className="text-sm text-muted-foreground">Active</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, purpose, tech stack…"
            className="border-border bg-muted pl-8 text-foreground"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleStageFilter(tag)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                stageFilter.has(tag) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {STAGE_TAG_LABEL[tag]}
            </button>
          ))}
        </div>
      </div>

      {products === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {products.length === 0 ? "No products yet." : "Nothing matches this filter."}
          </p>
          {canCreate && products.length === 0 && (
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add your first product
            </Button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Purpose</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-b border-border bg-card hover:bg-muted/50 transition-colors last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{p.project_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.stage_tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{STAGE_TAG_LABEL[tag]}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize ${PRIORITY_STYLE[p.priority]}`}>{p.priority}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground line-clamp-1 max-w-xs">{p.purpose || "—"}</td>
                  <td className="px-4 py-3">
                    {(canUpdate || canDelete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canUpdate && <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>}
                          {canDelete && <DropdownMenuItem onClick={() => handleDelete(p)} className="text-red-400 focus:text-red-400"><Trash2 className="h-3.5 w-3.5" /> Delete</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => (
            <Card key={p.id} className="h-full">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{p.project_name}</CardTitle>
                  {(canUpdate || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdate && (
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem onClick={() => handleDelete(p)} className="text-red-400 focus:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize ${PRIORITY_STYLE[p.priority]}`}>
                    {p.priority}
                  </span>
                  {p.stage_tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {STAGE_TAG_LABEL[tag]}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.purpose && <p className="line-clamp-3 text-xs text-muted-foreground">{p.purpose}</p>}
                {p.tech_stack && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Tech:</span> {p.tech_stack}
                  </p>
                )}
                {p.credentials && p.credentials.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {p.credentials.map((c) =>
                      c.url ? (
                        <a
                          key={c.id}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {c.label}
                        </a>
                      ) : null,
                    )}
                  </div>
                )}

                <div className="border-t border-border pt-2">
                  <button
                    type="button"
                    onClick={() => setDocsOpenId((v) => (v === p.id ? null : p.id))}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {docsOpenId === p.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    <FolderOpen className="h-3.5 w-3.5" />
                    Documents
                  </button>
                  {docsOpenId === p.id && accountId && user?.id && (
                    <div className="mt-2">
                      <FileManager accountId={accountId} userId={user.id} projectId={null} productId={p.id} hideViewToggle />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editTarget} onSaved={load} />
    </div>
  );
}

function ProductFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Product | null;
  onSaved: () => void;
}) {
  const [projectName, setProjectName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [techStack, setTechStack] = useState("");
  const [priority, setPriority] = useState<ProductPriority>("medium");
  const [stageTags, setStageTags] = useState<Set<ProductStageTag>>(new Set());
  const [credentials, setCredentials] = useState<Partial<ProductCredential>[]>([]);
  const [saving, setSaving] = useState(false);
  const { accountId } = useAuth();

  useEffect(() => {
    if (!open) return;
    setProjectName(initial?.project_name ?? "");
    setPurpose(initial?.purpose ?? "");
    setTechStack(initial?.tech_stack ?? "");
    setPriority(initial?.priority ?? "medium");
    setStageTags(new Set(initial?.stage_tags ?? []));
    setCredentials(initial?.credentials?.length ? initial.credentials : []);
  }, [open, initial]);

  function toggleStageTag(tag: ProductStageTag) {
    setStageTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function addCredential() {
    setCredentials((prev) => [...prev, { label: "", url: "", username: "", password: "" }]);
  }
  function updateCredential(i: number, patch: Partial<ProductCredential>) {
    setCredentials((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function removeCredential(i: number) {
    setCredentials((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const payload = {
        project_name: trimmed,
        purpose: purpose.trim() || null,
        tech_stack: techStack.trim() || null,
        priority,
        stage_tags: [...stageTags],
      };
      const res = await fetch(initial ? `/api/products/${initial.id}` : "/api/products", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not save this product.");
        return;
      }

      const productId = initial ? initial.id : (await res.json()).product.id;
      await syncCredentials(productId);

      onOpenChange(false);
      onSaved();
      toast.success(initial ? "Product updated." : "Product added.");
    } finally {
      setSaving(false);
    }
  }

  // Credentials aren't behind a REST route (RLS already lets an agent+
  // manage them directly, same pattern as Kanban/Company Info) — a
  // simple replace-all keeps the diffing logic out of this form: wipe
  // this product's rows, reinsert whatever's currently in the list.
  async function syncCredentials(productId: string) {
    if (!accountId) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.from("product_credentials").delete().eq("product_id", productId);
    const rows = credentials
      .filter((c) => c.label?.trim() || c.url?.trim())
      .map((c, i) => ({
        account_id: accountId,
        product_id: productId,
        label: c.label?.trim() || `Link ${i + 1}`,
        url: c.url?.trim() || null,
        username: c.username?.trim() || null,
        password: c.password?.trim() || null,
        position: i,
      }));
    if (rows.length > 0) {
      await supabase.from("product_credentials").insert(rows);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-popover border-border max-h-[88vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{initial ? `Edit ${initial.project_name}` : "New product"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Project name</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="border-border bg-muted text-foreground" autoFocus />
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Purpose</Label>
            <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} className="border-border bg-muted text-foreground" rows={3} />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Stage (select all that apply)</Label>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleStageTag(tag)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    stageTags.has(tag) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {STAGE_TAG_LABEL[tag]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Priority</Label>
            <Select value={priority} onValueChange={(v) => v && setPriority(v as ProductPriority)}>
              <SelectTrigger className="w-full">
                <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Tech stack</Label>
            <Textarea value={techStack} onChange={(e) => setTechStack(e.target.value)} className="border-border bg-muted text-foreground" rows={2} />
          </div>

          <div className="grid gap-2">
            <Label className="text-muted-foreground">Links &amp; credentials</Label>
            <div className="flex flex-col gap-2">
              {credentials.map((c, i) => (
                <CredentialRow key={i} value={c} onChange={(patch) => updateCredential(i, patch)} onRemove={() => removeCredential(i)} />
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addCredential} className="w-fit">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add a link
            </Button>
          </div>
        </div>
        <DialogFooter className="border-border bg-popover/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !projectName.trim()}>
            {saving ? "Saving…" : initial ? "Save" : "Add product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CredentialRow({
  value,
  onChange,
  onRemove,
}: {
  value: Partial<ProductCredential>;
  onChange: (patch: Partial<ProductCredential>) => void;
  onRemove: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border p-2">
      <Input
        value={value.label ?? ""}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Display name (e.g. Admin Panel)"
        className="col-span-2 h-8 border-border bg-muted text-xs text-foreground"
      />
      <Input
        value={value.url ?? ""}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="https://…"
        className="col-span-2 h-8 border-border bg-muted text-xs text-foreground"
      />
      <Input
        value={value.username ?? ""}
        onChange={(e) => onChange({ username: e.target.value })}
        placeholder="Username"
        className="h-8 border-border bg-muted text-xs text-foreground"
      />
      <div className="relative">
        <Input
          type={showPassword ? "text" : "password"}
          value={value.password ?? ""}
          onChange={(e) => onChange({ password: e.target.value })}
          placeholder="Password"
          className="h-8 border-border bg-muted pr-14 text-xs text-foreground"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-400"
          aria-label="Remove link"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
