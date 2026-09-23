"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText, ArrowLeft, Loader2, Plus, Pencil, X, Trash2,
  ChevronRight, Home, CheckCircle2, CreditCard, CalendarDays,
  Hash, Building2, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

type InvoiceStatus = "draft" | "sent" | "viewed" | "paid" | "partially_paid" | "overdue" | "cancelled" | "void";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  line_total: number;
  position: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_id: string | null;
  project_id: string | null;
  currency: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  amount: number;
  po_number: string | null;
  customer_note: string | null;
  internal_note: string | null;
  notes: string | null;
  sent_at: string | null;
  created_at: string;
  invoice_items: InvoiceItem[];
  invoice_payments: Payment[];
}

const STATUS_META: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft:          { label: "Draft",          cls: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  sent:           { label: "Sent",           cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  viewed:         { label: "Viewed",         cls: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  paid:           { label: "Paid",           cls: "bg-green-500/20 text-green-400 border-green-500/30" },
  partially_paid: { label: "Partially Paid", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  overdue:        { label: "Overdue",        cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  cancelled:      { label: "Cancelled",      cls: "bg-slate-600/20 text-slate-500 border-slate-600/30" },
  void:           { label: "Void",           cls: "bg-slate-600/20 text-slate-500 border-slate-600/30" },
};

const METHOD_LABEL: Record<string, string> = {
  upi: "UPI", bank_transfer: "Bank Transfer", cash: "Cash",
  cheque: "Cheque", card: "Card", other: "Other",
};

function fmt(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount ?? 0);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Add Payment Modal ─────────────────────────────────────────────────────────

function AddPaymentModal({
  open, onClose, onSaved, invoice,
}: { open: boolean; onClose: () => void; onSaved: () => void; invoice: Invoice | null }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && invoice) setAmount(String(invoice.balance_due || invoice.total_amount || ""));
  }, [open, invoice]);

  async function handleSave() {
    if (!invoice || !amount) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), payment_method: method, payment_date: date, reference: ref, notes }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.error ?? "Failed"); return; }
      toast.success("Payment recorded.");
      onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  if (!open || !invoice) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-[#2a3045] bg-[#0f1117] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">Record Payment</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Balance due: <span className="text-white font-medium">{fmt(invoice.balance_due ?? invoice.total_amount, invoice.currency)}</span></p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount *</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Payment Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Reference (UTR / cheque no.)</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)}
              className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none resize-none" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[#2a3045] text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={handleSave} disabled={saving || !amount}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-sm text-white hover:bg-green-500 disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status change dropdown ────────────────────────────────────────────────────

function StatusChanger({ invoice, onChanged }: { invoice: Invoice; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function changeStatus(s: InvoiceStatus) {
    setSaving(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.error ?? "Failed"); return; }
      toast.success("Status updated.");
      onChanged();
    } finally { setSaving(false); }
  }

  const meta = STATUS_META[invoice.status] ?? STATUS_META.draft;
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} disabled={saving}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${meta.cls}`}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {meta.label}
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-[#2a3045] bg-[#1a1f2e] shadow-xl py-1">
          {(Object.keys(STATUS_META) as InvoiceStatus[]).map((s) => (
            <button key={s} onClick={() => changeStatus(s)}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-300 hover:bg-[#2a3045] transition-colors">
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}`);
      if (!res.ok) { toast.error("Invoice not found"); router.push("/office/invoices"); return; }
      const d = await res.json();
      setInvoice(d.invoice);
    } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#0f1117]">
      <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
    </div>
  );

  if (!invoice) return null;

  const total = invoice.total_amount || invoice.amount || 0;
  const paid = invoice.paid_amount || 0;
  const balance = invoice.balance_due ?? (total - paid);
  const items = invoice.invoice_items ?? [];
  const payments = invoice.invoice_payments ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = invoice.due_date && invoice.due_date < today && balance > 0 && !["paid","cancelled","void"].includes(invoice.status);

  return (
    <>
      <AddPaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} onSaved={load} invoice={invoice} />

      <div className="min-h-screen bg-[#0f1117]">
        <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Home className="h-3 w-3" />
            <Link href="/office" className="hover:text-white">Office</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/office/invoices" className="hover:text-white">Invoices</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-300 font-mono">{invoice.invoice_number}</span>
          </div>

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push("/office/invoices")} className="text-slate-500 hover:text-white transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-white font-mono">{invoice.invoice_number}</h1>
                  {isOverdue && (
                    <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-400">
                      <AlertTriangle className="h-3 w-3" /> Overdue
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-0.5">{invoice.client_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {balance > 0 && !["paid","cancelled","void"].includes(invoice.status) && (
                <button onClick={() => setPaymentOpen(true)}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 transition-colors">
                  <CreditCard className="h-4 w-4" /> Record Payment
                </button>
              )}
              <StatusChanger invoice={invoice} onChanged={load} />
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total", value: fmt(total, invoice.currency), cls: "text-white" },
              { label: "Paid", value: fmt(paid, invoice.currency), cls: "text-green-400" },
              { label: "Balance", value: fmt(balance, invoice.currency), cls: balance > 0 ? "text-amber-400" : "text-slate-500" },
              { label: "Due Date", value: fmtDate(invoice.due_date), cls: isOverdue ? "text-red-400" : "text-slate-300" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
                <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                <p className={`text-lg font-bold ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Two column layout */}
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            {/* Left column */}
            <div className="space-y-4">
              {/* Invoice meta */}
              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-4">Invoice Details</p>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                  {[
                    { icon: Hash, label: "Invoice No.", value: invoice.invoice_number },
                    { icon: Building2, label: "Client", value: invoice.client_name },
                    { icon: CalendarDays, label: "Issue Date", value: fmtDate(invoice.issue_date) },
                    { icon: CalendarDays, label: "Due Date", value: fmtDate(invoice.due_date) },
                    ...(invoice.po_number ? [{ icon: Hash, label: "PO Number", value: invoice.po_number }] : []),
                    { icon: CheckCircle2, label: "Created", value: fmtDateTime(invoice.created_at) },
                  ].map((row) => (
                    <div key={row.label} className="flex items-start gap-2">
                      <row.icon className="h-3.5 w-3.5 text-slate-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[10px] text-slate-500">{row.label}</p>
                        <p className="text-slate-300 font-medium">{row.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Line items */}
              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e]">
                <div className="px-5 pt-5 pb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Line Items</p>
                </div>
                <div className="overflow-x-auto">
                  {items.length === 0 ? (
                    <p className="px-5 pb-5 text-sm text-slate-600">No line items recorded.</p>
                  ) : (
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-y border-[#2a3045] text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-5 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-right w-16">Qty</th>
                          <th className="px-3 py-2 text-right w-24">Rate</th>
                          <th className="px-3 py-2 text-right w-20">Disc%</th>
                          <th className="px-3 py-2 text-right w-20">Tax%</th>
                          <th className="px-5 py-2 text-right w-28">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.sort((a, b) => a.position - b.position).map((item) => (
                          <tr key={item.id} className="border-b border-[#2a3045] last:border-0">
                            <td className="px-5 py-3 text-slate-300">{item.description || <span className="text-slate-600">—</span>}</td>
                            <td className="px-3 py-3 text-right text-slate-400">{item.quantity} {item.unit}</td>
                            <td className="px-3 py-3 text-right text-slate-400">{fmt(item.unit_price, invoice.currency)}</td>
                            <td className="px-3 py-3 text-right text-slate-500 text-xs">{item.discount_pct > 0 ? `${item.discount_pct}%` : "—"}</td>
                            <td className="px-3 py-3 text-right text-slate-500 text-xs">{item.tax_pct > 0 ? `${item.tax_pct}%` : "—"}</td>
                            <td className="px-5 py-3 text-right font-medium text-white">{fmt(item.line_total, invoice.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Totals */}
                <div className="border-t border-[#2a3045] px-5 py-4">
                  <div className="flex justify-end">
                    <div className="w-52 space-y-1.5 text-sm">
                      <div className="flex justify-between text-slate-400">
                        <span>Subtotal</span><span>{fmt(invoice.subtotal || total, invoice.currency)}</span>
                      </div>
                      {(invoice.discount_amount || 0) > 0 && (
                        <div className="flex justify-between text-amber-400">
                          <span>Discount</span><span>-{fmt(invoice.discount_amount, invoice.currency)}</span>
                        </div>
                      )}
                      {(invoice.tax_amount || 0) > 0 && (
                        <div className="flex justify-between text-slate-400">
                          <span>Tax</span><span>{fmt(invoice.tax_amount, invoice.currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-white border-t border-[#2a3045] pt-1.5">
                        <span>Total</span><span>{fmt(total, invoice.currency)}</span>
                      </div>
                      {paid > 0 && (
                        <div className="flex justify-between text-green-400">
                          <span>Paid</span><span>-{fmt(paid, invoice.currency)}</span>
                        </div>
                      )}
                      {balance > 0 && (
                        <div className={`flex justify-between font-semibold ${isOverdue ? "text-red-400" : "text-amber-400"}`}>
                          <span>Balance Due</span><span>{fmt(balance, invoice.currency)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {(invoice.customer_note || invoice.notes) && (
                <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Customer Note</p>
                  <p className="text-sm text-slate-400 whitespace-pre-wrap">{invoice.customer_note || invoice.notes}</p>
                </div>
              )}
              {invoice.internal_note && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/70 mb-2">Internal Note (CRM only)</p>
                  <p className="text-sm text-amber-300/70 whitespace-pre-wrap">{invoice.internal_note}</p>
                </div>
              )}
            </div>

            {/* Right column – Payment history */}
            <div className="space-y-4">
              <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e]">
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payment History</p>
                  {balance > 0 && !["paid","cancelled","void"].includes(invoice.status) && (
                    <button onClick={() => setPaymentOpen(true)}
                      className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  )}
                </div>
                {payments.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-slate-600">No payments recorded.</p>
                ) : (
                  <div className="divide-y divide-[#2a3045]">
                    {payments.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()).map((p) => (
                      <div key={p.id} className="px-5 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-green-400">{fmt(p.amount, invoice.currency)}</span>
                          <span className="text-[10px] text-slate-500">{fmtDate(p.payment_date)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-xs text-slate-500">{METHOD_LABEL[p.payment_method] ?? p.payment_method}</span>
                          {p.reference && <span className="text-[10px] font-mono text-slate-600">{p.reference}</span>}
                        </div>
                        {p.notes && <p className="text-xs text-slate-600 mt-1">{p.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {total > 0 && (
                <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-5">
                  <div className="flex justify-between text-xs text-slate-500 mb-2">
                    <span>Payment progress</span>
                    <span>{Math.round((paid / total) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#2a3045] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.min(100, (paid / total) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-2">
                    <span className="text-green-400">{fmt(paid, invoice.currency)} paid</span>
                    <span className={balance > 0 ? "text-amber-400" : "text-slate-500"}>{fmt(balance, invoice.currency)} left</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
