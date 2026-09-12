"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Package, Plus, Trash2, Pencil, ChevronUp, ChevronDown,
  ChevronsUpDown, Loader2, ExternalLink, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { toast } from "sonner";
import type { AccountMember } from "@/types";

interface Product { id: string; name: string }
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
  product?: { id: string; name: string } | null;
  stage?: { id: string; name: string } | null;
}

type SortField = "title" | "priority" | "due_date" | "created_at";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/20 border-red-500/30",
  high: "text-orange-400 bg-orange-500/20 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/20 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/20 border-blue-500/30",
};

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="h-3 w-3 text-slate-600" />;
  return sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-blue-400" /> : <ChevronDown className="h-3 w-3 text-blue-400" />;
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function ProductTaskModal({
  open, onClose, onSaved,
  task, products, stages, members,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
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
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const assigneeRef = useRef<HTMLDivElement>(null);

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
    setStageId(task?.stage_id ?? "__none__");
    setPriority(task?.priority ?? "medium");
    setAssigneeIds(
      task?.assignee_user_ids?.length ? task.assignee_user_ids
        : task?.assignee_user_id ? [task.assignee_user_id] : []
    );
    setDueDate(task?.due_date ?? "");
    setShowDate(task?.show_date ?? "");
  }, [open, task]);

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
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not save task");
        return;
      }
      toast.success(isEdit ? "Task updated" : "Task created");
      onClose();
      onSaved();
    } finally { setSaving(false); }
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a3045] px-6 py-4">
          <h2 className="text-base font-semibold text-white">{isEdit ? "Edit Task" : "New Product Task"}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-[#2a3045] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Task name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Task name</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="Enter task title"
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Product + Stage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Product (optional)</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none"
              >
                <option value="__none__">None</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Stage</label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none"
              >
                <option value="__none__">None</option>
                {sortedStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Instructions / Brief */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Instructions / Brief</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Add instructions or brief..."
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Priority</label>
            <div className="flex gap-2">
              {["urgent", "high", "medium", "low"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    priority === p
                      ? PRIORITY_COLOR[p]
                      : "border-[#2a3045] bg-[#0f1117] text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Assignees */}
          <div className="relative" ref={assigneeRef}>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Assignees</label>
            <button
              type="button"
              onClick={() => setShowAssigneePicker((v) => !v)}
              className="w-full flex items-center justify-between rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 hover:border-teal-500/50 focus:outline-none"
            >
              <span className="flex flex-wrap gap-1">
                {selectedAssignees.length > 0
                  ? selectedAssignees.map((m) => (
                    <span key={m.user_id} className="flex items-center gap-1 rounded-full bg-teal-500/20 px-2 py-0.5 text-[11px] text-teal-300">
                      {m.full_name}
                    </span>
                  ))
                  : <span className="text-slate-600">Unassigned</span>
                }
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            </button>
            {showAssigneePicker && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-[#2a3045] bg-[#1a1f2e] shadow-xl">
                {members.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleAssignee(m.user_id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-[#2a3045] transition-colors"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border text-[9px] ${assigneeIds.includes(m.user_id) ? "border-teal-500 bg-teal-500 text-white" : "border-[#3a4055]"}`}>
                      {assigneeIds.includes(m.user_id) ? "✓" : ""}
                    </span>
                    {m.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Target date + Show date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Target date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Show date (optional)</label>
              <input
                type="date"
                value={showDate}
                onChange={(e) => setShowDate(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-600">Show date — task stays hidden from the main list until this date.</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[#2a3045] px-6 py-4">
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
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ProductTasksPage() {
  const { accountId } = useAuth();
  const [tasks, setTasks] = useState<ProductTask[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("pt-sort-field") as SortField) ?? "created_at";
    return "created_at";
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    if (typeof window !== "undefined") return (localStorage.getItem("pt-sort-dir") as SortDir) ?? "desc";
    return "desc";
  });
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<ProductTask | null>(null);

  // Supporting data
  const [products, setProducts] = useState<Product[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);

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
    const [membersRes, productsData, stagesData] = await Promise.all([
      fetch("/api/account/members").then((r) => r.ok ? r.json() : null),
      supabase.from("products").select("id, name").eq("account_id", accountId).order("name"),
      supabase.from("pipeline_stages").select("id, name, position").order("position"),
    ]);
    if (membersRes?.members) setMembers(membersRes.members);
    if (productsData.data) setProducts(productsData.data);
    if (stagesData.data) setStages(stagesData.data);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSupporting(); }, [loadSupporting]);

  function toggleSort(field: SortField) {
    const newDir = sortField === field && sortDir === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortDir(newDir);
    localStorage.setItem("pt-sort-field", field);
    localStorage.setItem("pt-sort-dir", newDir);
  }

  const filtered = (tasks ?? [])
    .filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
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
      return dir * a.created_at.localeCompare(b.created_at);
    });

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this task?")) return;
    const res = await fetch(`/api/product-tasks/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete"); return; }
    load(); toast.success("Task deleted");
  }

  function openCreate() { setEditTask(null); setModalOpen(true); }
  function openEdit(task: ProductTask) { setEditTask(task); setModalOpen(true); }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <>
      {modalOpen && (
        <ProductTaskModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={load}
          task={editTask}
          products={products}
          stages={stages}
          members={members}
        />
      )}

      <div className="min-h-screen bg-[#0f1117]">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/20">
                <Package className="h-5 w-5 text-teal-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Product Tasks</h1>
                <p className="text-sm text-slate-400">Tasks linked to your product catalog</p>
              </div>
            </div>
            <button type="button" onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 transition-colors">
              <Plus className="h-4 w-4" /> New Task
            </button>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[180px] max-w-xs rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
              <option value="all">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <Link href="/products" className="ml-auto flex items-center gap-1.5 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors">
              <ExternalLink className="h-3.5 w-3.5" /> Products
            </Link>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 text-center gap-3">
              <Package className="h-10 w-10 text-slate-700" />
              <p className="text-slate-500 text-sm">{search || priorityFilter !== "all" ? "No tasks match this filter." : "No product tasks yet."}</p>
              <button type="button" onClick={openCreate}
                className="flex items-center gap-2 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-4 py-2 text-sm text-slate-300 hover:border-teal-500/50 transition-colors">
                <Plus className="h-4 w-4" /> Create first task
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#2a3045]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3045] bg-[#1a1f2e] text-left text-[11px] uppercase tracking-wider text-slate-500">
                    {(["title", "priority", "due_date"] as SortField[]).map((f) => (
                      <th key={f} className="px-4 py-2.5 font-medium">
                        <button type="button" onClick={() => toggleSort(f)}
                          className="flex items-center gap-1 hover:text-slate-300 transition-colors">
                          {f === "due_date" ? "Due Date" : f.charAt(0).toUpperCase() + f.slice(1)}
                          <SortIcon field={f} sortField={sortField} sortDir={sortDir} />
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Stage</th>
                    <th className="px-4 py-2.5 font-medium">Assignees</th>
                    <th className="px-4 py-2.5 font-medium w-0" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((task) => {
                    const isOverdue = task.due_date && task.due_date < todayStr;
                    const isToday = task.due_date === todayStr;
                    return (
                      <tr key={task.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{task.title}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[task.priority] ?? ""}`}>
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {task.due_date ? (
                            <span className={`text-xs font-medium ${isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-slate-400"}`}>
                              {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{task.product?.name ?? <span className="text-slate-600">—</span>}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{task.stage?.name ?? <span className="text-slate-600">—</span>}</td>
                        <td className="px-4 py-3">
                          {(task.assignee_user_ids ?? []).length > 0 ? (
                            <div className="flex items-center gap-1">
                              {(task.assignee_user_ids ?? []).slice(0, 3).map((uid) => {
                                const m = members.find((m) => m.user_id === uid);
                                return (
                                  <span key={uid} title={m?.full_name ?? uid}
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-500/20 text-[9px] font-bold text-teal-300">
                                    {(m?.full_name ?? "?").charAt(0).toUpperCase()}
                                  </span>
                                );
                              })}
                              {(task.assignee_user_ids ?? []).length > 3 && (
                                <span className="text-[10px] text-slate-500">+{(task.assignee_user_ids ?? []).length - 3}</span>
                              )}
                            </div>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openEdit(task)}
                              className="flex items-center gap-1 rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-white transition-colors">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => handleDelete(task.id)}
                              className="flex items-center gap-1 rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
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
    </>
  );
}
