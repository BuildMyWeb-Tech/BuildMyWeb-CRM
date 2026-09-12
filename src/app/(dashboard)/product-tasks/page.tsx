"use client";

import { useEffect, useState, useCallback } from "react";
import { Package, Plus, Trash2, Pencil, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { toast } from "sonner";

interface ProductTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  assignee_user_id: string | null;
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

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDue, setNewDue] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit
  const [editTask, setEditTask] = useState<ProductTask | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState("medium");
  const [editDue, setEditDue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/product-tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

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

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/product-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), priority: newPriority, due_date: newDue || null }),
      });
      if (!res.ok) { toast.error("Could not create task"); return; }
      setNewTitle(""); setNewPriority("medium"); setNewDue(""); setShowCreate(false);
      load(); toast.success("Task created");
    } finally { setCreating(false); }
  }

  async function handleSave() {
    if (!editTask || !editTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/product-tasks/${editTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), priority: editPriority, due_date: editDue || null }),
      });
      if (!res.ok) { toast.error("Could not save"); return; }
      setEditTask(null); load(); toast.success("Task saved");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this task?")) return;
    const res = await fetch(`/api/product-tasks/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete"); return; }
    load(); toast.success("Task deleted");
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
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
          <button type="button" onClick={() => setShowCreate(true)}
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

        {/* Inline create */}
        {showCreate && (
          <div className="rounded-xl border border-teal-500/30 bg-[#1a1f2e] p-4 space-y-3">
            <p className="text-sm font-medium text-white">New Product Task</p>
            <input autoFocus type="text" placeholder="Task title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
            <div className="flex flex-wrap gap-2">
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}
                className="rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-1.5 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)}
                className="rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-1.5 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
              <div className="flex gap-2 ml-auto">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-[#2a3045] px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button type="button" onClick={handleCreate} disabled={creating || !newTitle.trim()}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm text-white hover:bg-teal-500 disabled:opacity-50 transition-colors">
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 text-center gap-3">
            <Package className="h-10 w-10 text-slate-700" />
            <p className="text-slate-500 text-sm">{search || priorityFilter !== "all" ? "No tasks match this filter." : "No product tasks yet."}</p>
            <button type="button" onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-4 py-2 text-sm text-slate-300 hover:border-teal-500/50">
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
                  <th className="px-4 py-2.5 font-medium w-0" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => {
                  const isOverdue = task.due_date && task.due_date < todayStr;
                  const isToday = task.due_date === todayStr;
                  const isEdit = editTask?.id === task.id;
                  return (
                    <tr key={task.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                      <td className="px-4 py-3">
                        {isEdit ? (
                          <input autoFocus value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full rounded border border-[#2a3045] bg-[#0f1117] px-2 py-1 text-sm text-white focus:border-teal-500 focus:outline-none" />
                        ) : (
                          <span className="font-medium text-white">{task.title}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEdit ? (
                          <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}
                            className="rounded border border-[#2a3045] bg-[#0f1117] px-2 py-1 text-sm text-slate-300 focus:outline-none">
                            {["urgent", "high", "medium", "low"].map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        ) : (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_COLOR[task.priority] ?? ""}`}>
                            {task.priority}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEdit ? (
                          <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)}
                            className="rounded border border-[#2a3045] bg-[#0f1117] px-2 py-1 text-sm text-slate-300 focus:outline-none" />
                        ) : task.due_date ? (
                          <span className={`text-xs font-medium ${isOverdue ? "text-red-400" : isToday ? "text-amber-400" : "text-slate-400"}`}>
                            {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {task.product?.name ?? <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {isEdit ? (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={handleSave} disabled={saving}
                              className="rounded bg-teal-600 px-2 py-1 text-[11px] text-white hover:bg-teal-500 disabled:opacity-50">
                              {saving ? "…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditTask(null)}
                              className="rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-white">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => { setEditTask(task); setEditTitle(task.title); setEditPriority(task.priority); setEditDue(task.due_date ?? ""); }}
                              className="flex items-center gap-1 rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-white transition-colors">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => handleDelete(task.id)}
                              className="flex items-center gap-1 rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
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
  );
}
