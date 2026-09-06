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
import type { Product } from "@/types";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { toast } from "sonner";

// Product — a flat internal registry of BMW's own/client products:
// what it's for, where it lives, what it's built with. Distinct from
// Client Directory (a relationship) and Projects (a piece of active
// work) — a product can predate or outlive either.
export default function ProductsPage() {
  const { canCreate, canUpdate, canDelete } = usePagePermissions("products");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

  async function load() {
    const res = await fetch("/api/products");
    if (res.ok) setProducts((await res.json()).products ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const visible = (products ?? []).filter((p) => {
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Products</h1>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            New product
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {products ? `${products.length} product${products.length === 1 ? "" : "s"}` : "Loading…"}
      </p>

      <div className="relative mt-4 w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, purpose, tech stack…"
          className="border-border bg-muted pl-8 text-foreground"
        />
      </div>

      {products === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {products.length === 0 ? "No products yet." : "Nothing matches this search."}
          </p>
          {canCreate && products.length === 0 && (
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add your first product
            </Button>
          )}
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
              </CardHeader>
              <CardContent className="space-y-2">
                {p.purpose && <p className="line-clamp-3 text-xs text-muted-foreground">{p.purpose}</p>}
                {p.tech_stack && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Tech:</span> {p.tech_stack}
                  </p>
                )}
                {(p.project_url_1 || p.project_url_2) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {p.project_url_1 && (
                      <a
                        href={p.project_url_1}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Link 1
                      </a>
                    )}
                    {p.project_url_2 && (
                      <a
                        href={p.project_url_2}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Link 2
                      </a>
                    )}
                  </div>
                )}
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
  const [url1, setUrl1] = useState("");
  const [url2, setUrl2] = useState("");
  const [techStack, setTechStack] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProjectName(initial?.project_name ?? "");
    setPurpose(initial?.purpose ?? "");
    setUrl1(initial?.project_url_1 ?? "");
    setUrl2(initial?.project_url_2 ?? "");
    setTechStack(initial?.tech_stack ?? "");
  }, [open, initial]);

  async function handleSave() {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const payload = {
        project_name: trimmed,
        purpose: purpose.trim() || null,
        project_url_1: url1.trim() || null,
        project_url_2: url2.trim() || null,
        tech_stack: techStack.trim() || null,
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
      onOpenChange(false);
      onSaved();
      toast.success(initial ? "Product updated." : "Product added.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-popover border-border max-h-[88vh] overflow-y-auto overflow-x-hidden">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Project URL 1</Label>
              <Input value={url1} onChange={(e) => setUrl1(e.target.value)} placeholder="https://…" className="border-border bg-muted text-foreground" />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Project URL 2</Label>
              <Input value={url2} onChange={(e) => setUrl2(e.target.value)} placeholder="https://…" className="border-border bg-muted text-foreground" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Tech stack</Label>
            <Textarea value={techStack} onChange={(e) => setTechStack(e.target.value)} className="border-border bg-muted text-foreground" rows={2} />
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
