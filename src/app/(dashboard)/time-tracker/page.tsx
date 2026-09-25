"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, Plus, Trash2, Pencil, Loader2, X, Timer } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface TimeEntry {
  id: string;
  client_name: string | null;
  task_name: string | null;
  hours: number;
  entry_date: string;
  notes: string | null;
  project?: { id: string; name: string } | null;
}

function fmt(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

interface FormState {
  id?: string;
  client_name: string;
  task_name: string;
  hours: string;
  entry_date: string;
  notes: string;
}

function Modal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: FormState | null;
}) {
  const [form, setForm] = useState<FormState>({ client_name: "", task_name: "", hours: "", entry_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(initial ?? { client_name: "", task_name: "", hours: "", entry_date: new Date().toISOString().slice(0, 10), notes: "" });
  }, [open, initial]);

  async function save() {
    if (!form.hours || parseFloat(form.hours) <= 0) { toast.error("Enter valid hours"); return; }
    setSaving(true);
    try {
      const url = form.id ? `/api/time-entries/${form.id}` : "/api/time-entries";
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, hours: parseFloat(form.hours) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.error ?? "Failed"); return; }
      toast.success(form.id ? "Entry updated." : "Entry logged.");
      onSaved(); onClose();
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-[#2a3045] bg-[#0f1117] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{form.id ? "Edit Time Entry" : "Log Time"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date</label>
              <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Hours *</label>
              <input type="number" step="0.25" min="0" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="2.5"
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Client</label>
            <input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Client name"
              className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Task / Work done</label>
            <input value={form.task_name} onChange={(e) => setForm({ ...form, task_name: e.target.value })} placeholder="What did you work on?"
              className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-blue-500 focus:outline-none resize-none" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[#2a3045] text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving || !form.hours}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-500 disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {form.id ? "Save" : "Log Time"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimeTrackerPage() {
  const { accountId } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<FormState | null>(null);
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/time-entries?month=${month}`);
      if (res.ok) { const d = await res.json(); setEntries(d.entries ?? []); }
    } finally { setLoading(false); }
  }, [accountId, month]);

  useEffect(() => { load(); }, [load]);

  async function del(id: string) {
    if (!confirm("Delete this time entry?")) return;
    const res = await fetch(`/api/time-entries/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete"); return; }
    toast.success("Deleted."); load();
  }

  const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const todayHours = entries.filter((e) => e.entry_date === today.toISOString().slice(0, 10)).reduce((s, e) => s + e.hours, 0);
  const byClient: Record<string, number> = {};
  for (const e of entries) { const k = e.client_name || "No Client"; byClient[k] = (byClient[k] ?? 0) + e.hours; }
  const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditEntry(null); }} onSaved={load} initial={editEntry} />
      <div className="min-h-screen bg-[#0f1117] p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
              <Timer className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Time Tracker</h1>
              <p className="text-sm text-slate-400">Track how you spend your working hours</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
            <button onClick={() => { setEditEntry(null); setModalOpen(true); }}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500">
              <Plus className="h-4 w-4" /> Log Time
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "This Month", value: fmt(totalHours), sub: `${entries.length} entries`, color: "text-teal-400", bg: "bg-teal-500/10" },
            { label: "Today", value: fmt(todayHours), sub: "logged today", color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Daily Avg", value: fmt(totalHours / Math.max(1, new Date().getDate())), sub: "hours/day", color: "text-purple-400", bg: "bg-purple-500/10" },
            { label: "Top Client", value: topClients[0]?.[0] ?? "—", sub: topClients[0] ? fmt(topClients[0][1]) : "no data", color: "text-amber-400", bg: "bg-amber-500/10" },
          ].map((c) => (
            <div key={c.label} className={`rounded-xl border border-[#2a3045] ${c.bg} p-4`}>
              <p className="text-xs text-slate-500 mb-1">{c.label}</p>
              <p className={`text-xl font-bold ${c.color} truncate`}>{c.value}</p>
              <p className="text-xs text-slate-600 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          {/* Entries table */}
          <div className="rounded-xl border border-[#2a3045] overflow-hidden">
            {loading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Clock className="h-10 w-10 text-slate-700" />
                <p className="text-slate-500">No time logged for this month.</p>
                <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 text-sm text-teal-400 hover:text-teal-300">
                  <Plus className="h-4 w-4" /> Log your first entry
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3045] bg-[#1a1f2e] text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Task</th>
                    <th className="px-4 py-3 text-right">Hours</th>
                    <th className="px-4 py-3 w-0" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(e.entry_date)}</td>
                      <td className="px-4 py-3 text-slate-300">{e.client_name || <span className="text-slate-600">—</span>}</td>
                      <td className="px-4 py-3 text-slate-300">{e.task_name || <span className="text-slate-600">—</span>}</td>
                      <td className="px-4 py-3 text-right font-semibold text-teal-400">{fmt(e.hours)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditEntry({ id: e.id, client_name: e.client_name ?? "", task_name: e.task_name ?? "", hours: String(e.hours), entry_date: e.entry_date, notes: e.notes ?? "" }); setModalOpen(true); }}
                            className="p-1 text-slate-500 hover:text-white rounded transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => del(e.id)} className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* By client */}
          {topClients.length > 0 && (
            <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4 space-y-3 self-start">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hours by Client</p>
              {topClients.map(([name, hrs]) => (
                <div key={name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 truncate">{name}</span>
                    <span className="text-teal-400 font-medium ml-2">{fmt(hrs)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#2a3045] overflow-hidden">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${(hrs / totalHours) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
