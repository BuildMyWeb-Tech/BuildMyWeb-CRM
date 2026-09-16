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
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Routine {
  id: string;
  title: string;
  notes: string | null;
  order_index: number;
  is_hidden: boolean;
}

type TabKey = "all" | "completed" | "pending";

// Returns the "routine day" date key (UTC date string).
// If current time is before 04:30 local, the routine day is yesterday.
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
    const optimistic: Routine = {
      id: optimisticId,
      title,
      notes: null,
      order_index: maxOrder + 1,
      is_hidden: false,
    };
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
      await supabase
        .from("daily_routine_completions")
        .delete()
        .eq("routine_id", id)
        .eq("day_key", dayKey);
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

  // Drag-and-drop reorder
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
    await Promise.all(
      updated.map((r) => supabase.from("daily_routines").update({ order_index: r.order_index }).eq("id", r.id))
    );
  }

  function setTabPersisted(t: TabKey) {
    setTab(t);
    try { localStorage.setItem("routine-tab", t); } catch { /* ignore */ }
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

  return (
    <div className="flex flex-col h-full bg-[#0a0d14] p-4 md:p-8 overflow-y-auto">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Daily Routine</h1>
            <p className="text-xs text-slate-500 mt-0.5">Resets at 4:30 AM · {dayKey}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-[#1a1f2e] px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors border border-[#2a3045]"
          >
            {showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showHidden ? "Hide hidden" : "Show hidden"}
          </button>
        </div>

        {/* Progress bar */}
        <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">Progress</span>
            <span className="text-sm font-bold text-teal-400">{done}/{total} · {progress}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#0f1117] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-blue-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#2a3045]">
          {(["all", "completed", "pending"] as TabKey[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTabPersisted(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors",
                tab === t
                  ? "border-teal-500 text-teal-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Add new */}
        <div className="flex items-center gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a routine item…"
            className="bg-[#1a1f2e] border-[#2a3045] text-white placeholder:text-slate-600"
            onKeyDown={(e) => { if (e.key === "Enter") addRoutine(); }}
          />
          <Button
            onClick={addRoutine}
            disabled={adding || !newTitle.trim()}
            size="sm"
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* List */}
        <div className="space-y-1">
          {tabFiltered.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">
              {tab === "completed" ? "Nothing completed yet today." : tab === "pending" ? "All done!" : "No routine items yet."}
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
                  "flex items-center gap-3 rounded-xl border px-3 py-3 transition-all",
                  isDone
                    ? "border-teal-500/20 bg-teal-500/5"
                    : "border-[#2a3045] bg-[#1a1f2e]",
                  r.is_hidden && "opacity-50",
                  dragId === r.id && "opacity-30"
                )}
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-600 active:cursor-grabbing" />
                <button
                  type="button"
                  onClick={() => toggleComplete(r.id)}
                  className="shrink-0 text-muted-foreground hover:text-teal-400"
                >
                  {isDone
                    ? <CheckCircle2 className="h-5 w-5 text-teal-400" />
                    : <Circle className="h-5 w-5" />}
                </button>
                <span className={cn("flex-1 text-sm", isDone ? "text-slate-500 line-through" : "text-white")}>
                  {r.title}
                </span>
                <button
                  type="button"
                  onClick={() => toggleHidden(r.id)}
                  title={r.is_hidden ? "Show" : "Hide"}
                  className="shrink-0 text-slate-600 hover:text-slate-300 transition-colors"
                >
                  {r.is_hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => removeRoutine(r.id)}
                  className="shrink-0 text-slate-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
