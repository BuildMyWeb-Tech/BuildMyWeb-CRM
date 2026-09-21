"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Routine {
  id: string;
  title: string;
  notes: string | null;
  order_index: number;
  is_hidden: boolean;
}

type TabKey = "all" | "completed" | "pending";

function getRoutineDayKey(): string {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(4, 30, 0, 0);
  if (now < cutoff) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff.toISOString().slice(0, 10);
}

export default function RoutinePage() {
  const { accountId, user } = useAuth();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      return (localStorage.getItem("routine-tab") as TabKey) ?? "all";
    } catch {
      return "all";
    }
  });
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOverId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dayKey = getRoutineDayKey();

  const load = useCallback(async () => {
    if (!accountId || !user) return;
    const supabase = createClient();
    const [{ data: rData }, { data: cData }] = await Promise.all([
      supabase
        .from("daily_routines")
        .select("id, title, notes, order_index, is_hidden")
        .eq("account_id", accountId)
        .eq("user_id", user.id)
        .order("order_index"),
      supabase
        .from("daily_routine_completions")
        .select("routine_id")
        .eq("user_id", user.id)
        .eq("day_key", dayKey),
    ]);
    if (rData) setRoutines(rData as Routine[]);
    if (cData) setCompletedIds(new Set(cData.map((c) => c.routine_id)));
  }, [accountId, user, dayKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function addRoutine() {
    const title = newTitle.trim();
    if (!title || !accountId || !user) return;
    setAdding(true);
    const maxOrder = routines.reduce((m, r) => Math.max(m, r.order_index), -1);
    const optimisticId = crypto.randomUUID();
    const optimistic: Routine = { id: optimisticId, title, notes: null, order_index: maxOrder + 1, is_hidden: false };
    setRoutines((prev) => [...prev, optimistic]);
    setNewTitle("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("daily_routines")
        .insert({ account_id: accountId, user_id: user.id, title, order_index: maxOrder + 1 })
        .select("id, title, notes, order_index, is_hidden")
        .single();
      if (error) throw error;
      setRoutines((prev) => prev.map((r) => (r.id === optimisticId ? (data as Routine) : r)));
    } catch {
      toast.error("Could not add routine.");
      setRoutines((prev) => prev.filter((r) => r.id !== optimisticId));
      setNewTitle(title);
    } finally {
      setAdding(false);
    }
  }

  async function removeRoutine(id: string) {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    const supabase = createClient();
    const { error } = await supabase.from("daily_routines").delete().eq("id", id);
    if (error) toast.error("Could not delete routine.");
  }

  async function toggleComplete(id: string) {
    const isDone = completedIds.has(id);
    if (isDone) {
      setCompletedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      const supabase = createClient();
      await supabase.from("daily_routine_completions").delete().eq("routine_id", id).eq("day_key", dayKey);
    } else {
      setCompletedIds((prev) => new Set([...prev, id]));
      const supabase = createClient();
      const { error } = await supabase
        .from("daily_routine_completions")
        .upsert({ routine_id: id, user_id: user!.id, day_key: dayKey }, { onConflict: "routine_id,day_key" });
      if (error) {
        setCompletedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
        toast.error("Could not save completion.");
      }
    }
  }

  async function toggleHidden(id: string) {
    const r = routines.find((x) => x.id === id);
    if (!r) return;
    setRoutines((prev) => prev.map((x) => (x.id === id ? { ...x, is_hidden: !x.is_hidden } : x)));
    const supabase = createClient();
    await supabase.from("daily_routines").update({ is_hidden: !r.is_hidden }).eq("id", id);
  }

  function onDragStart(id: string) { setDragId(id); }
  function onDragOver(id: string, e: React.DragEvent) { e.preventDefault(); dragOverId.current = id; }
  async function onDrop() {
    if (!dragId || !dragOverId.current || dragId === dragOverId.current) { setDragId(null); return; }
    const from = routines.findIndex((r) => r.id === dragId);
    const to = routines.findIndex((r) => r.id === dragOverId.current);
    if (from < 0 || to < 0) { setDragId(null); return; }
    const reordered = [...routines];
    const [item] = reordered.splice(from, 1);
    reordered.splice(to, 0, item);
    const updated = reordered.map((r, i) => ({ ...r, order_index: i }));
    setRoutines(updated);
    setDragId(null);
    dragOverId.current = null;
    const supabase = createClient();
    await Promise.all(updated.map((r) => supabase.from("daily_routines").update({ order_index: r.order_index }).eq("id", r.id)));
  }

  function setTabPersisted(t: TabKey) {
    setTab(t);
    try { localStorage.setItem("routine-tab", t); } catch {}
  }

  const visible = routines.filter((r) => showHidden || !r.is_hidden);
  const total = routines.filter((r) => !r.is_hidden).length;
  const done = [...completedIds].filter((id) => routines.some((r) => r.id === id && !r.is_hidden)).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  const tabFiltered = visible.filter((r) => {
    if (tab === "completed") return completedIds.has(r.id);
    if (tab === "pending") return !completedIds.has(r.id);
    return true;
  });

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-[#0a0d14]">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Daily Routine</h1>
            <p className="text-sm text-slate-500 mt-0.5">{today}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-[#1a1f2e] px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors border border-[#2a3045]"
          >
            {showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showHidden ? "Hide hidden" : "Show hidden"}
          </button>
        </div>

        {/* Progress card */}
        <div className="rounded-2xl border border-[#2a3045] bg-[#1a1f2e] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-slate-400">Today&apos;s Progress</p>
              <p className="text-3xl font-bold text-white mt-0.5">{progress}%</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-teal-400">{done}</p>
              <p className="text-xs text-slate-500">of {total} done</p>
            </div>
          </div>
          <div className="h-3 w-full rounded-full bg-[#0f1117] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progress}%`,
                background: progress === 100
                  ? "linear-gradient(90deg, #10b981, #06b6d4)"
                  : "linear-gradient(90deg, #14b8a6, #3b82f6)",
              }}
            />
          </div>
          {progress === 100 && (
            <p className="mt-2 text-center text-xs font-semibold text-teal-400">All done for today!</p>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1a1f2e] border border-[#2a3045]">
          {(["all", "pending", "completed"] as TabKey[]).map((t) => {
            const count = t === "all" ? visible.length : t === "completed" ? done : total - done;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTabPersisted(t)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all capitalize",
                  tab === t
                    ? "bg-[#0f1117] text-white shadow"
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                {t}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  tab === t ? "bg-teal-500/20 text-teal-400" : "bg-[#2a3045] text-slate-500"
                )}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Add new item */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addRoutine(); }}
              placeholder="Add a routine item…"
              className="w-full rounded-xl border border-[#2a3045] bg-[#1a1f2e] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={addRoutine}
            disabled={adding || !newTitle.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-40 transition-colors"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {/* Routine list */}
        <div className="space-y-2">
          {tabFiltered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-slate-500 text-sm">
                {tab === "completed" ? "Nothing completed yet today." : tab === "pending" ? "All done! Great work." : "No routine items yet — add one above."}
              </p>
            </div>
          )}
          {tabFiltered.map((r) => {
            const isDone = completedIds.has(r.id);
            return (
              <div
                key={r.id}
                draggable
                onDragStart={() => onDragStart(r.id)}
                onDragOver={(e) => onDragOver(r.id, e)}
                onDrop={onDrop}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all duration-200",
                  isDone
                    ? "border-teal-500/20 bg-teal-500/5"
                    : "border-[#2a3045] bg-[#1a1f2e] hover:border-[#3a4055]",
                  r.is_hidden && "opacity-40",
                  dragId === r.id && "opacity-30 scale-95"
                )}
              >
                {/* Drag handle */}
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-700 group-hover:text-slate-500 active:cursor-grabbing transition-colors" />

                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggleComplete(r.id)}
                  className="shrink-0 transition-transform active:scale-90"
                >
                  {isDone
                    ? <CheckCircle2 className="h-5 w-5 text-teal-400" />
                    : <Circle className="h-5 w-5 text-slate-600 hover:text-slate-400 transition-colors" />}
                </button>

                {/* Title */}
                <span className={cn("flex-1 text-sm select-none", isDone ? "text-slate-500 line-through" : "text-white")}>
                  {r.title}
                </span>

                {/* Actions — visible on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => toggleHidden(r.id)}
                    title={r.is_hidden ? "Show" : "Hide"}
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-[#2a3045] hover:text-slate-300 transition-colors"
                  >
                    {r.is_hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRoutine(r.id)}
                    className="rounded-lg p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
