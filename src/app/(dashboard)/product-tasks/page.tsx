"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Package, Plus, Trash2, ChevronUp, ChevronDown,
  ChevronsUpDown, Loader2, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { AccountMember } from "@/types";

interface Product { id: string; project_name: string; status?: string }
interface Stage { id: string; name: string; position: number }

interface ProductTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  show_date: string | null;
  assignee_user_id: string | null;
  assignee_user_ids: string[];
  product_id: string | null;
  stage_id: string | null;
  created_at: string;
  product?: { id: string; name: string; project_name?: string } | null;
  stage?: { id: string; name: string } | null;
}

type SortField = "title" | "stage" | "priority" | "product" | "assignee" | "due_date" | "show_date";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/20 border-red-500/30",
  high: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/20 border-blue-500/30",
};

const STAGE_COLOR: Record<string, string> = {
  "in progress": "text-blue-400 bg-blue-500/20 border-blue-500/30",
  "to do": "text-slate-400 bg-slate-500/20 border-slate-500/30",
  "done": "text-green-400 bg-green-500/20 border-green-500/30",
  "review": "text-purple-400 bg-purple-500/20 border-purple-500/30",
};

function stageColor(name: string) {
  return STAGE_COLOR[name.toLowerCase()] ?? "text-slate-400 bg-slate-500/20 border-slate-500/30";
}

function ColHeader({
  field, label, sortField, sortDir, onSort,
}: {
  field: SortField; label: string;
  sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button type="button" onClick={() => onSort(field)}
      className="flex items-center gap-1 hover:text-slate-300 transition-colors">
      {label}
      {active
        ? sortDir === "asc"
          ? <ChevronUp className="h-3 w-3 text-blue-400" />
          : <ChevronDown className="h-3 w-3 text-blue-400" />
        : <ChevronsUpDown className="h-3 w-3 text-slate-600" />}
    </button>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function ProductTaskModal({
  open, onClose, onSaved, onDeleted,
  task, products, stages, members,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  task: ProductTask | null;
  products: Product[];
  stages: Stage[];
  members: AccountMember[];
}) {
  const isEdit = !!task;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productId, setProductId] = useState("__none__");
  const [stageId, setStageId] = useState("__none__");
  const [priority, setPriority] = useState("medium");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [showDate, setShowDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
        setShowAssigneePicker(false);
      }
    }
    if (showAssigneePicker) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAssigneePicker]);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setProductId(task?.product_id ?? "__none__");
    const existingProduct = products.find((p) => p.id === (task?.product_id ?? "__none__"));
    setProductSearch(existingProduct?.project_name ?? "");
    setStageId(task?.stage_id ?? "__none__");
    setPriority(task?.priority ?? "medium");
    setAssigneeIds(
      task?.assignee_user_ids?.length ? task.assignee_user_ids
        : task?.assignee_user_id ? [task.assignee_user_id] : []
    );
    setDueDate(task?.due_date ?? "");
    setShowDate(task?.show_date ?? "");
  }, [open, task, products]);

  if (!open) return null;

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        product_id: productId === "__none__" ? null : productId,
        stage_id: stageId === "__none__" ? null : stageId,
        priority,
        assignee_user_id: assigneeIds[0] ?? null,
        assignee_user_ids: assigneeIds,
        due_date: dueDate || null,
        show_date: showDate || null,
      };
      const url = isEdit ? `/api/product-tasks/${task!.id}` : "/api/product-tasks";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not save task");
        return;
      }
      const resData = await res.json().catch(() => ({}));
      if (resData?.auto_deleted) {
        toast.success("Task moved to Done and removed");
        onClose(); onSaved(); return;
      }
      toast.success(isEdit ? "Task updated" : "Task created");
      onClose(); onSaved();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!task) return;
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/product-tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Could not delete task"); return; }
      toast.success("Task deleted");
      onClose(); onDeleted();
    } finally { setDeleting(false); }
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  const sortedStages = [...stages].sort((a, b) => a.position - b.position);
  const selectedAssignees = members.filter((m) => assigneeIds.includes(m.user_id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[#2a3045] bg-[#1a1f2e] shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-[#2a3045] px-6 py-4">
          <h2 className="text-base font-semibold text-white">{isEdit ? "Edit Task" : "New Product Task"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-[#2a3045] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Task name</label>
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Enter task title"
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Product</label>
              <div ref={productRef} className="relative">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                  placeholder="Search product…"
                  className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
                />
                {showProductDropdown && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] shadow-xl max-h-48 overflow-y-auto">
                    <button type="button" onMouseDown={() => { setProductId("__none__"); setProductSearch(""); setShowProductDropdown(false); }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-[#2a3045] transition-colors">
                      None
                    </button>
                    {products.filter((p) => p.project_name.toLowerCase().includes(productSearch.toLowerCase())).map((p) => (
                      <button key={p.id} type="button" onMouseDown={() => { setProductId(p.id); setProductSearch(p.project_name); setShowProductDropdown(false); }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[#2a3045] ${productId === p.id ? "text-teal-400" : "text-slate-300"}`}>
                        {p.project_name}
                      </button>
                    ))}
                    {products.filter((p) => p.project_name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-sm text-slate-600">No products found</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Stage</label>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
                <option value="__none__">None</option>
                {sortedStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Instructions / Brief</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              placeholder="Add instructions or brief..."
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none resize-none" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Priority</label>
            <div className="flex gap-2">
              {["urgent", "high", "medium", "low"].map((p) => (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition-colors ${priority === p ? PRIORITY_COLOR[p] : "border-[#2a3045] bg-[#0f1117] text-slate-500 hover:text-slate-300"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="relative" ref={assigneeRef}>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Assignees</label>
            <button type="button" onClick={() => setShowAssigneePicker((v) => !v)}
              className="w-full flex items-center justify-between rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 hover:border-teal-500/50 focus:outline-none">
              <span className="flex flex-wrap gap-1">
                {selectedAssignees.length > 0
                  ? selectedAssignees.map((m) => (
                    <span key={m.user_id} className="flex items-center gap-1 rounded-full bg-teal-500/20 px-2 py-0.5 text-[11px] text-teal-300">{m.full_name}</span>
                  ))
                  : <span className="text-slate-600">Unassigned</span>}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            </button>
            {showAssigneePicker && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-[#2a3045] bg-[#1a1f2e] shadow-xl">
                {members.map((m) => (
                  <button key={m.user_id} type="button" onClick={() => toggleAssignee(m.user_id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-[#2a3045] transition-colors">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border text-[9px] ${assigneeIds.includes(m.user_id) ? "border-teal-500 bg-teal-500 text-white" : "border-[#3a4055]"}`}>
                      {assigneeIds.includes(m.user_id) ? "✓" : ""}
                    </span>
                    {m.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Target date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Show date (optional)</label>
              <input type="date" value={showDate} onChange={(e) => setShowDate(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
            </div>
          </div>
          <p className="text-[11px] text-slate-600">Show date — task stays hidden from the main list until this date.</p>
        </div>

        <div className="flex items-center justify-between border-t border-[#2a3045] px-6 py-4">
          {isEdit ? (
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Deleting…" : "Delete Task"}
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-[#2a3045] px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !title.trim()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ProductTasksPage() {
  const { accountId } = useAuth();
  const [tasks, setTasks] = useState<ProductTask[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>(() => {
    try { return (localStorage.getItem("pt-sort-field") as SortField) || "due_date"; } catch { return "due_date"; }
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try { return (localStorage.getItem("pt-sort-dir") as SortDir) || "asc"; } catch { return "asc"; }
  });
  const [priorityFilter, setPriorityFilter] = useState(() => {
    try { return localStorage.getItem("pt-priority") || "all"; } catch { return "all"; }
  });
  const [personFilter, setPersonFilter] = useState(() => {
    try { return localStorage.getItem("pt-person") || "all"; } catch { return "all"; }
  });
  const [productFilter, setProductFilter] = useState(() => {
    try { return localStorage.getItem("pt-product") || "all"; } catch { return "all"; }
  });
  const [overdueOnly, setOverdueOnly] = useState(() => {
    try { return localStorage.getItem("pt-overdue") === "1"; } catch { return false; }
  });
  const [viewMode, setViewMode] = useState<"current" | "scheduled" | "all">(() => {
    try { return (localStorage.getItem("pt-view") as "current" | "scheduled" | "all") || "current"; } catch { return "current"; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<ProductTask | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/product-tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
      }
    } finally { setLoading(false); }
  }, [accountId]);

  const loadSupporting = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();
    const [membersRes, productsRes, stagesData] = await Promise.all([
      fetch("/api/account/members").then((r) => r.ok ? r.json() : null),
      fetch("/api/products").then((r) => r.ok ? r.json() : null),
      supabase.from("pipeline_stages").select("id, name, position").order("position"),
    ]);
    if (membersRes?.members) setMembers(membersRes.members);
    if (productsRes?.products) {
      setProducts(productsRes.products.map((p: { id: string; project_name: string; status?: string }) => ({
        id: p.id, project_name: p.project_name, status: p.status,
      })));
    }
    if (stagesData.data) {
      const seen = new Set<string>();
      setStages(stagesData.data.filter((s) => { if (seen.has(s.name)) return false; seen.add(s.name); return true; }));
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSupporting(); }, [loadSupporting]);

  function setPriorityFilterPersisted(v: string) { setPriorityFilter(v); try { localStorage.setItem("pt-priority", v); } catch {} }
  function setPersonFilterPersisted(v: string) { setPersonFilter(v); try { localStorage.setItem("pt-person", v); } catch {} }
  function setProductFilterPersisted(v: string) { setProductFilter(v); try { localStorage.setItem("pt-product", v); } catch {} }
  function setOverduePersisted(v: boolean) { setOverdueOnly(v); try { localStorage.setItem("pt-overdue", v ? "1" : "0"); } catch {} }
  function setViewModePersisted(v: "current" | "scheduled" | "all") { setViewMode(v); try { localStorage.setItem("pt-view", v); } catch {} }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      const next: SortDir = sortDir === "asc" ? "desc" : "asc";
      setSortDir(next);
      try { localStorage.setItem("pt-sort-dir", next); } catch {}
    } else {
      setSortField(field);
      setSortDir("asc");
      try { localStorage.setItem("pt-sort-field", field); localStorage.setItem("pt-sort-dir", "asc"); } catch {}
    }
  }

  function getMemberName(uid: string) {
    return members.find((m) => m.user_id === uid)?.full_name ?? "Unknown";
  }

  const filtered = (tasks ?? [])
    .filter((t) => {
      if (viewMode === "current" && t.show_date && t.show_date > todayStr) return false;
      if (viewMode === "scheduled" && !(t.show_date && t.show_date > todayStr)) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (personFilter !== "all") {
        const ids = t.assignee_user_ids?.length ? t.assignee_user_ids : t.assignee_user_id ? [t.assignee_user_id] : [];
        if (!ids.includes(personFilter)) return false;
      }
      if (productFilter !== "all" && t.product_id !== productFilter) return false;
      if (overdueOnly && !(t.due_date && t.due_date < todayStr)) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortField === "priority") return dir * ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
      if (sortField === "due_date") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return dir * a.due_date.localeCompare(b.due_date);
      }
      if (sortField === "title") return dir * a.title.localeCompare(b.title);
      if (sortField === "stage") {
        const as = a.stage?.name ?? "";
        const bs = b.stage?.name ?? "";
        return dir * as.localeCompare(bs);
      }
      if (sortField === "product") {
        const ap = (a.product as { project_name?: string } | null)?.project_name ?? "";
        const bp = (b.product as { project_name?: string } | null)?.project_name ?? "";
        return dir * ap.localeCompare(bp);
      }
      if (sortField === "assignee") {
        const aid = a.assignee_user_ids?.[0] ?? a.assignee_user_id ?? "";
        const bid = b.assignee_user_ids?.[0] ?? b.assignee_user_id ?? "";
        return dir * getMemberName(aid).localeCompare(getMemberName(bid));
      }
      if (sortField === "show_date") {
        if (!a.show_date && !b.show_date) return 0;
        if (!a.show_date) return 1;
        if (!b.show_date) return -1;
        return dir * a.show_date.localeCompare(b.show_date);
      }
      return 0;
    });

  function openCreate() { setEditTask(null); setModalOpen(true); }
  function openEdit(task: ProductTask) { setEditTask(task); setModalOpen(true); }

  const productsWithTasks = products.filter((p) => (tasks ?? []).some((t) => t.product_id === p.id));

  // Stat counts
  const allTasks = tasks ?? [];
  const inProgressCount = allTasks.filter((t) => (t.stage as { name?: string } | null)?.name?.toLowerCase().includes("progress")).length;
  const dueTodayCount = allTasks.filter((t) => t.due_date === todayStr).length;
  const overdueCount = allTasks.filter((t) => t.due_date && t.due_date < todayStr).length;

  const statCards = [
    { label: "Total Tasks", value: allTasks.length, color: "text-white" },
    { label: "In Progress", value: inProgressCount, color: "text-blue-400" },
    { label: "Due Today", value: dueTodayCount, color: "text-yellow-400" },
    { label: "Overdue", value: overdueCount, color: "text-red-400" },
  ];

  return (
    <>
      {modalOpen && (
        <ProductTaskModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={load}
          onDeleted={load}
          task={editTask}
          products={products}
          stages={stages}
          members={members}
        />
      )}

      <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0f1117]">
        {/* ── Main content ── */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Header */}
          <div className="shrink-0 px-6 pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-teal-500/10 p-2">
                  <Package className="h-5 w-5 text-teal-400" />
                </div>
                <h1 className="text-2xl font-bold text-white">Product Tasks</h1>
              </div>
              <button type="button" onClick={openCreate}
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 transition-colors">
                <Plus className="h-4 w-4" /> New Task
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="shrink-0 grid grid-cols-4 gap-4 px-6 pb-4">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
                <p className={`text-2xl font-bold ${card.color}`}>
                  {loading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-white/10" /> : card.value}
                </p>
                <p className="text-xs text-slate-400 mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* View mode tabs + count */}
          <div className="shrink-0 px-6 pb-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 rounded-lg bg-[#1a1f2e] p-1 w-fit">
              {(["current", "scheduled", "all"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setViewModePersisted(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === mode ? "bg-blue-500/20 text-blue-400" : "text-slate-400 hover:text-slate-200"}`}>
                  {mode === "current" ? "Current Tasks" : mode === "scheduled" ? "Scheduled" : "All Tasks"}
                </button>
              ))}
            </div>
            {!loading && tasks !== null && (
              <p className="text-xs text-slate-500 shrink-0">
                {filtered.length === tasks.length
                  ? `${tasks.length} task${tasks.length !== 1 ? "s" : ""}`
                  : <><span className="font-medium text-slate-300">{filtered.length}</span> of {tasks.length} tasks — filtered</>}
              </p>
            )}
          </div>

          {/* Filter bar */}
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-6 pb-3">
            <select value={priorityFilter} onChange={(e) => setPriorityFilterPersisted(e.target.value)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
              <option value="all">Priority: All</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select value={personFilter} onChange={(e) => setPersonFilterPersisted(e.target.value)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
              <option value="all">People: All</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
            </select>
            <select value={productFilter} onChange={(e) => setProductFilterPersisted(e.target.value)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
              <option value="all">Product: All</option>
              {productsWithTasks.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
            <button type="button" onClick={() => setOverduePersisted(!overdueOnly)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${overdueOnly ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-[#2a3045] bg-[#1a1f2e] text-slate-400 hover:text-white"}`}>
              Overdue
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto px-6 pb-6">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 text-center gap-3">
                <Package className="h-10 w-10 text-slate-700" />
                <p className="text-slate-500 text-sm">No product tasks match this filter.</p>
                <button type="button" onClick={openCreate}
                  className="flex items-center gap-2 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-4 py-2 text-sm text-slate-300 hover:border-teal-500/50 transition-colors">
                  <Plus className="h-4 w-4" /> Create task
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#2a3045]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3045] bg-[#1a1f2e] text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="w-8 px-3 py-3" />
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="title" label="Task" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="stage" label="Stage" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="priority" label="Priority" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="product" label="Product" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="assignee" label="Assignee" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="due_date" label="Target Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                      <th className="px-4 py-3 font-medium">
                        <ColHeader field="show_date" label="Show Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((task) => {
                      const isOverdue = task.due_date && task.due_date < todayStr;
                      const isToday = task.due_date === todayStr;
                      const assigneeNames = (task.assignee_user_ids?.length
                        ? task.assignee_user_ids
                        : task.assignee_user_id ? [task.assignee_user_id] : []
                      ).map((uid) => getMemberName(uid)).filter(Boolean);
                      const stageName = task.stage?.name ?? "";
                      const productName = (task.product as { project_name?: string } | null)?.project_name ?? "";

                      return (
                        <tr key={task.id}
                          onClick={() => openEdit(task)}
                          className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors cursor-pointer">
                          <td className="px-3 py-3">
                            <span className="block h-1.5 w-1.5 rounded-full bg-teal-500/40 mx-auto" />
                          </td>
                          <td className="px-4 py-3 font-medium text-white max-w-xs">
                            <span className="line-clamp-1">{task.title}</span>
                          </td>
                          <td className="px-4 py-3">
                            {stageName ? (
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageColor(stageName)}`}>
                                {stageName}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[task.priority] ?? ""}`}>
                              {task.priority}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {productName || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300">
                            {assigneeNames.length > 0
                              ? assigneeNames.join(", ")
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {task.due_date ? (
                              <span className={`text-xs font-medium ${isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-slate-400"}`}>
                                {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {task.show_date ? (
                              <span className="text-xs font-medium text-slate-400">
                                {new Date(task.show_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar — Products ── */}
        <div className="w-64 shrink-0 border-l border-[#2a3045] bg-[#1a1f2e] flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-teal-400" />
              <h2 className="text-sm font-semibold text-white">Products</h2>
            </div>

            {(["active", "inactive", "archived"] as const).map((status) => {
              const group = products.filter((p) => (p.status ?? "active") === status);
              if (group.length === 0) return null;
              const taskCountMap = new Map<string, number>();
              for (const t of (tasks ?? [])) {
                if (t.product_id) taskCountMap.set(t.product_id, (taskCountMap.get(t.product_id) ?? 0) + 1);
              }
              return (
                <div key={status}>
                  <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600 capitalize">{status}</p>
                  <div className="space-y-0.5">
                    {group.map((p) => (
                      <button key={p.id} type="button"
                        onClick={() => setProductFilter(productFilter === p.id ? "all" : p.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 transition-colors text-left ${productFilter === p.id ? "bg-teal-500/10 text-teal-300" : "hover:bg-[#0f1117] text-slate-300 hover:text-white"}`}>
                        <span className="h-5 w-5 shrink-0 rounded bg-teal-500/20 flex items-center justify-center text-[9px] font-bold text-teal-300">
                          {p.project_name.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 truncate text-xs">{p.project_name}</span>
                        <span className="shrink-0 text-[11px] font-medium text-slate-500">
                          {taskCountMap.get(p.id) ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {products.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-3">No products</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
