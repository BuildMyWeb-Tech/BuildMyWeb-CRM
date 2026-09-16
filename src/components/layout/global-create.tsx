"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Briefcase,
  ClipboardList,
  FolderPlus,
  Package,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";

type CreateType =
  | "project"
  | "project-task"
  | "product"
  | "product-task"
  | "enquiry"
  | "client";

interface CreateOption {
  type: CreateType;
  label: string;
  icon: typeof Plus;
}

const OPTIONS: CreateOption[] = [
  { type: "project", label: "Project", icon: FolderPlus },
  { type: "project-task", label: "Project Task", icon: ClipboardList },
  { type: "product", label: "Product", icon: Package },
  { type: "product-task", label: "Product Task", icon: ClipboardList },
  { type: "enquiry", label: "Enquiry", icon: Briefcase },
  { type: "client", label: "Client", icon: Users },
];

interface GlobalCreateButtonProps {
  /** Extra class names for the trigger button. */
  className?: string;
}

export function GlobalCreateButton({ className }: GlobalCreateButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [createType, setCreateType] = useState<CreateType | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  return (
    <>
      <div className={`relative ${className ?? ""}`} ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow transition-colors hover:bg-primary/90"
          aria-label="Create new"
        >
          <Plus className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-11 z-50 min-w-44 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Create
            </p>
            {OPTIONS.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => { setCreateType(type); setMenuOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {createType && (
        <CreateDialog
          type={createType}
          onClose={() => setCreateType(null)}
        />
      )}
    </>
  );
}

// ── Per-type create dialogs ────────────────────────────────────────────────────

function CreateDialog({ type, onClose }: { type: CreateType; onClose: () => void }) {
  switch (type) {
    case "project":      return <CreateProjectDialog onClose={onClose} />;
    case "project-task": return <CreateProjectTaskDialog onClose={onClose} />;
    case "product":      return <CreateProductDialog onClose={onClose} />;
    case "product-task": return <CreateProductTaskDialog onClose={onClose} />;
    case "enquiry":      return <CreateEnquiryDialog onClose={onClose} />;
    case "client":       return <CreateClientDialog onClose={onClose} />;
  }
}

// ── Shared dialog wrapper ──────────────────────────────────────────────────────

function FormDialog({
  title,
  onClose,
  onSubmit,
  loading,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 mt-2">
          {children}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Project ────────────────────────────────────────────────────────────────────

function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      toast.success("Project created");
      onClose();
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDialog title="New Project" onClose={onClose} onSubmit={onSubmit} loading={loading}>
      <div className="space-y-1">
        <Label htmlFor="p-name">Project name</Label>
        <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Redesign" autoFocus />
      </div>
    </FormDialog>
  );
}

// ── Project Task ───────────────────────────────────────────────────────────────

function CreateProjectTaskDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.projects) setProjects(d.projects.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Task created");
      onClose();
      router.push(`/projects/${projectId}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDialog title="New Project Task" onClose={onClose} onSubmit={onSubmit} loading={loading}>
      <div className="space-y-1">
        <Label htmlFor="pt-title">Task title</Label>
        <Input id="pt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pt-project">Project</Label>
        <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "")}>
          <SelectTrigger id="pt-project">
            <SelectValue placeholder="Select project…" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FormDialog>
  );
}

// ── Product ────────────────────────────────────────────────────────────────────

function CreateProductDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      toast.success("Product created");
      onClose();
      router.push(`/products/${data.product?.id ?? ""}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDialog title="New Product" onClose={onClose} onSubmit={onSubmit} loading={loading}>
      <div className="space-y-1">
        <Label htmlFor="prod-name">Product name</Label>
        <Input id="prod-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Package" autoFocus />
      </div>
    </FormDialog>
  );
}

// ── Product Task ───────────────────────────────────────────────────────────────

function CreateProductTaskDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState("");
  const [products, setProducts] = useState<{ id: string; project_name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/products").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.products) setProducts(d.products);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !productId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/product-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), product_id: productId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Product task created");
      onClose();
      router.push(`/products/${productId}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDialog title="New Product Task" onClose={onClose} onSubmit={onSubmit} loading={loading}>
      <div className="space-y-1">
        <Label htmlFor="prdt-title">Task title</Label>
        <Input id="prdt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus />
      </div>
      <div className="space-y-1">
        <Label htmlFor="prdt-product">Product</Label>
        <Select value={productId} onValueChange={(v) => setProductId(v ?? "")}>
          <SelectTrigger id="prdt-product">
            <SelectValue placeholder="Select product…" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FormDialog>
  );
}

// ── Enquiry ────────────────────────────────────────────────────────────────────

function CreateEnquiryDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/client-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim(), phone: phone.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      toast.success("Enquiry created");
      onClose();
      router.push(`/client-leads/${data.lead?.id ?? ""}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDialog title="New Enquiry" onClose={onClose} onSubmit={onSubmit} loading={loading}>
      <div className="space-y-1">
        <Label htmlFor="enq-name">Name</Label>
        <Input id="enq-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" autoFocus />
      </div>
      <div className="space-y-1">
        <Label htmlFor="enq-phone">Phone (optional)</Label>
        <Input id="enq-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9999 000000" />
      </div>
    </FormDialog>
  );
}

// ── Client ─────────────────────────────────────────────────────────────────────

function CreateClientDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const data = await res.json();
      toast.success("Client created");
      onClose();
      router.push(`/clients/${data.client?.id ?? ""}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormDialog title="New Client" onClose={onClose} onSubmit={onSubmit} loading={loading}>
      <div className="space-y-1">
        <Label htmlFor="cl-name">Name</Label>
        <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" autoFocus />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cl-phone">Phone (optional)</Label>
        <Input id="cl-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9999 000000" />
      </div>
    </FormDialog>
  );
}
