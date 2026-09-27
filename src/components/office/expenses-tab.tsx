"use client";

import { useEffect, useState, useCallback } from "react";
import { Receipt, Plus, Trash2, Pencil, Loader2, X, TrendingDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Expense {
  id: string;
  name: string;
  category: string;
  amount: number;
  expense_date: string;
  notes: string | null;
}

const CATEGORIES = ["software","equipment","marketing","travel","meals","utilities","freelancer","rent","other"];
const CAT_COLOR: Record<string, string> = {
  software: "text-blue-400 bg-blue-500/10",
  equipment: "text-purple-400 bg-purple-500/10",
  marketing: "text-pink-400 bg-pink-500/10",
  travel: "text-amber-400 bg-amber-500/10",
  meals: "text-orange-400 bg-orange-500/10",
  utilities: "text-teal-400 bg-teal-500/10",
  freelancer: "text-green-400 bg-green-500/10",
  rent: "text-red-400 bg-red-500/10",
  other: "text-slate-400 bg-slate-500/10",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n ?? 0);
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

interface FormState { id?: string; name: string; category: string; amount: string; expense_date: string; notes: string; }

function ExpenseModal({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved: () => void; initial: FormState | null }) {
  const [form, setForm] = useState<FormState>({ name: "", category: "other", amount: "", expense_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm(initial ?? { name: "", category: "other", amount: "", expense_date: new Date().toISOString().slice(0, 10), notes: "" }); }, [open, initial]);

  async function save() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const url = form.id ? `/api/expenses/${form.id}` : "/api/expenses";
      const res = await fetch(url, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0 }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.error ?? "Failed"); return; }
      toast.success(form.id ? "Updated." : "Expense added."); onSaved(); onClose();
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">{form.id ? "Edit Expense" : "Add Expense"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Expense Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Canva Pro, AWS hosting"
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none capitalize">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Amount (₹)</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0"
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Date</label>
            <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none resize-none" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {form.id ? "Save" : "Add Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExpensesTab() {
  const { accountId } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<FormState | null>(null);
  const [catFilter, setCatFilter] = useState("all");
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (catFilter !== "all") params.set("category", catFilter);
      const res = await fetch(`/api/expenses?${params}`);
      if (res.ok) { const d = await res.json(); setExpenses(d.expenses ?? []); }
    } finally { setLoading(false); }
  }, [accountId, month, catFilter]);

  useEffect(() => { load(); }, [load]);

  async function del(id: string) {
    if (!confirm("Delete this expense?")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete"); return; }
    toast.success("Deleted."); load();
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  const topCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <ExpenseModal open={modalOpen} onClose={() => { setModalOpen(false); setEditExpense(null); }} onSaved={load} initial={editExpense} />
      <div className="mt-4 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-foreground focus:outline-none" />
          </div>
          <button onClick={() => { setEditExpense(null); setModalOpen(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Add Expense
          </button>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Spent", value: fmt(total), sub: `${expenses.length} expenses`, color: "text-red-400" },
            { label: "Top Category", value: topCats[0]?.[0] ? topCats[0][0].charAt(0).toUpperCase() + topCats[0][0].slice(1) : "—", sub: topCats[0] ? fmt(topCats[0][1]) : "no data", color: "text-amber-400" },
            { label: "Avg per Entry", value: fmt(total / Math.max(1, expenses.length)), sub: "per expense", color: "text-purple-400" },
            { label: "Categories", value: String(Object.keys(byCategory).length), sub: "used this month", color: "text-blue-400" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
              <p className={`text-xl font-bold ${c.color} truncate`}>{c.value}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2">
          {["all", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${catFilter === c ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}>
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <div className="rounded-xl border border-border overflow-hidden">
            {loading ? (
              <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <TrendingDown className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground">No expenses this month.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Expense</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 w-0" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(e.expense_date)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${CAT_COLOR[e.category] ?? CAT_COLOR.other}`}>{e.category}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-red-400">{fmt(e.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditExpense({ id: e.id, name: e.name, category: e.category, amount: String(e.amount), expense_date: e.expense_date, notes: e.notes ?? "" }); setModalOpen(true); }}
                            className="p-1 text-muted-foreground hover:text-foreground rounded"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => del(e.id)} className="p-1 text-muted-foreground hover:text-red-400 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {topCats.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3 self-start">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By Category</p>
              {topCats.map(([cat, amt]) => (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground capitalize">{cat}</span>
                    <span className="text-red-400 font-medium">{fmt(amt)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-red-500" style={{ width: `${(amt / total) * 100}%` }} />
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
