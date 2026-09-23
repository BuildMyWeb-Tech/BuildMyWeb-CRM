"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText, Plus, Trash2, Pencil, Loader2, ChevronRight, Home,
  TrendingUp, Clock, AlertCircle, CheckCircle2, Search, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  product_id: string | null;
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
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  amount: number;
  po_number: string | null;
  customer_note: string | null;
  internal_note: string | null;
  notes: string | null;
  created_at: string;
  invoice_items?: InvoiceItem[];
}

const STATUS_META: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft:          { label: "Draft",          cls: "bg-slate-500/20 text-slate-400" },
  sent:           { label: "Sent",           cls: "bg-blue-500/20 text-blue-400" },
  viewed:         { label: "Viewed",         cls: "bg-purple-500/20 text-purple-400" },
  paid:           { label: "Paid",           cls: "bg-green-500/20 text-green-400" },
  partially_paid: { label: "Partial",        cls: "bg-amber-500/20 text-amber-400" },
  overdue:        { label: "Overdue",        cls: "bg-red-500/20 text-red-400" },
  cancelled:      { label: "Cancelled",      cls: "bg-slate-600/20 text-slate-500" },
  void:           { label: "Void",           cls: "bg-slate-600/20 text-slate-500" },
};

function fmt(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount ?? 0);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Line item row ─────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
}

function calcLineTotal(item: LineItem) {
  const base = item.quantity * item.unit_price;
  const afterDisc = base * (1 - item.discount_pct / 100);
  return afterDisc * (1 + item.tax_pct / 100);
}

function LineItemRow({
  item, idx, onChange, onRemove,
}: { item: LineItem; idx: number; onChange: (i: number, f: Partial<LineItem>) => void; onRemove: (i: number) => void }) {
  return (
    <tr className="border-b border-[#2a3045]">
      <td className="px-2 py-2">
        <input value={item.description} onChange={(e) => onChange(idx, { description: e.target.value })}
          placeholder="Item / service description"
          className="w-full bg-transparent text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none" />
      </td>
      <td className="px-2 py-2 w-16">
        <input type="number" value={item.quantity} onChange={(e) => onChange(idx, { quantity: parseFloat(e.target.value) || 1 })}
          className="w-full bg-transparent text-sm text-slate-300 text-right focus:outline-none" />
      </td>
      <td className="px-2 py-2 w-14">
        <input value={item.unit} onChange={(e) => onChange(idx, { unit: e.target.value })}
          className="w-full bg-transparent text-xs text-slate-400 focus:outline-none" />
      </td>
      <td className="px-2 py-2 w-24">
        <input type="number" value={item.unit_price} onChange={(e) => onChange(idx, { unit_price: parseFloat(e.target.value) || 0 })}
          className="w-full bg-transparent text-sm text-slate-300 text-right focus:outline-none" />
      </td>
      <td className="px-2 py-2 w-16">
        <input type="number" value={item.discount_pct} onChange={(e) => onChange(idx, { discount_pct: parseFloat(e.target.value) || 0 })}
          className="w-full bg-transparent text-xs text-slate-400 text-right focus:outline-none" />
      </td>
      <td className="px-2 py-2 w-16">
        <input type="number" value={item.tax_pct} onChange={(e) => onChange(idx, { tax_pct: parseFloat(e.target.value) || 0 })}
          className="w-full bg-transparent text-xs text-slate-400 text-right focus:outline-none" />
      </td>
      <td className="px-2 py-2 w-24 text-right text-sm text-white font-medium">
        {fmt(calcLineTotal(item))}
      </td>
      <td className="px-2 py-2 w-8">
        <button type="button" onClick={() => onRemove(idx)} className="text-slate-600 hover:text-red-400 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ── Invoice form modal ────────────────────────────────────────────────────────

function InvoiceFormModal({
  open, onClose, onSaved, invoice,
}: { open: boolean; onClose: () => void; onSaved: () => void; invoice: Invoice | null }) {
  const { accountId } = useAuth();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit: "pcs", unit_price: 0, discount_pct: 0, tax_pct: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (invoice) {
      setInvoiceNumber(invoice.invoice_number);
      setClientName(invoice.client_name);
      setCurrency(invoice.currency || "INR");
      setStatus(invoice.status);
      setIssueDate(invoice.issue_date ?? "");
      setDueDate(invoice.due_date ?? "");
      setPoNumber(invoice.po_number ?? "");
      setCustomerNote(invoice.customer_note ?? invoice.notes ?? "");
      setInternalNote(invoice.internal_note ?? "");
      const existingItems = invoice.invoice_items ?? [];
      setLineItems(existingItems.length > 0
        ? existingItems.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unit_price: it.unit_price,
            discount_pct: it.discount_pct,
            tax_pct: it.tax_pct,
          }))
        : [{ description: "", quantity: 1, unit: "pcs", unit_price: invoice.amount || 0, discount_pct: 0, tax_pct: 0 }]
      );
    } else {
      setInvoiceNumber("");
      setClientName("");
      setCurrency("INR");
      setStatus("draft");
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate("");
      setPoNumber("");
      setCustomerNote("");
      setInternalNote("");
      setLineItems([{ description: "", quantity: 1, unit: "pcs", unit_price: 0, discount_pct: 0, tax_pct: 0 }]);
    }
  }, [open, invoice]);

  const subtotal = lineItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const discountTotal = lineItems.reduce((s, it) => s + it.quantity * it.unit_price * it.discount_pct / 100, 0);
  const taxTotal = lineItems.reduce((s, it) => {
    const afterDisc = it.quantity * it.unit_price * (1 - it.discount_pct / 100);
    return s + afterDisc * it.tax_pct / 100;
  }, 0);
  const grandTotal = subtotal - discountTotal + taxTotal;

  function updateItem(i: number, fields: Partial<LineItem>) {
    setLineItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...fields } : it));
  }
  function removeItem(i: number) {
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addItem() {
    setLineItems((prev) => [...prev, { description: "", quantity: 1, unit: "pcs", unit_price: 0, discount_pct: 0, tax_pct: 0 }]);
  }

  async function handleSave() {
    if (!clientName.trim()) { toast.error("Client name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        invoice_number: invoiceNumber || undefined,
        client_name: clientName.trim(),
        currency,
        status,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        po_number: poNumber || null,
        customer_note: customerNote || null,
        internal_note: internalNote || null,
        items: lineItems,
      };
      const url = invoice ? `/api/invoices/${invoice.id}` : "/api/invoices";
      const method = invoice ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d?.error ?? "Could not save invoice");
        return;
      }
      toast.success(invoice ? "Invoice updated." : "Invoice created.");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-8 px-4 pb-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-xl border border-[#2a3045] bg-[#0f1117] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a3045] px-6 py-4">
          <h2 className="text-lg font-semibold text-white">{invoice ? "Edit Invoice" : "New Invoice"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Section A – Invoice Info */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Invoice Information</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Invoice #</label>
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Auto-generated"
                  className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                  className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="viewed">Viewed</option>
                  <option value="paid">Paid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="void">Void</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Issue Date</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Section B – Client */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Client</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Client Name *</label>
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client or company name"
                  className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">PO Number</label>
                <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Optional"
                  className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 placeholder:text-slate-600 focus:border-teal-500 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Section C – Line Items */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Line Items</p>
            <div className="rounded-lg border border-[#2a3045] overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-[#2a3045] bg-[#1a1f2e] text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-2 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-right w-16">Qty</th>
                    <th className="px-2 py-2 text-left w-14">Unit</th>
                    <th className="px-2 py-2 text-right w-24">Rate</th>
                    <th className="px-2 py-2 text-right w-16">Disc%</th>
                    <th className="px-2 py-2 text-right w-16">Tax%</th>
                    <th className="px-2 py-2 text-right w-24">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <LineItemRow key={i} item={item} idx={i} onChange={updateItem} onRemove={removeItem} />
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t border-[#2a3045]">
                <button type="button" onClick={addItem}
                  className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add item
                </button>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-3 flex justify-end">
              <div className="w-56 space-y-1 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span><span>{fmt(subtotal, currency)}</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Discount</span><span>-{fmt(discountTotal, currency)}</span>
                  </div>
                )}
                {taxTotal > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Tax</span><span>{fmt(taxTotal, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-white border-t border-[#2a3045] pt-1 mt-1">
                  <span>Grand Total</span><span>{fmt(grandTotal, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Customer Note (visible on invoice)</label>
              <textarea value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} rows={3}
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none resize-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Internal Note (CRM only)</label>
              <textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={3}
                className="w-full rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none resize-none" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[#2a3045] px-6 py-4">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#2a3045] text-sm text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !clientName.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {invoice ? "Save Changes" : "Create Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Payment modal ─────────────────────────────────────────────────────────

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
    } finally {
      setSaving(false);
    }
  }

  if (!open || !invoice) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-[#2a3045] bg-[#0f1117] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">Record Payment — {invoice.invoice_number}</h3>
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
            <label className="text-xs text-slate-400 mb-1 block">Reference</label>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UTR / cheque number"
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const { accountId } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("q", search);
      const res = await fetch(`/api/invoices?${params}`);
      if (res.ok) {
        const d = await res.json();
        setInvoices(d.invoices ?? []);
      }
    } finally { setLoading(false); }
  }, [accountId, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(inv: Invoice) {
    if (!window.confirm(`Delete ${inv.invoice_number}? Only draft invoices can be deleted.`)) return;
    const res = await fetch(`/api/invoices/${inv.id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d?.error ?? "Could not delete"); return; }
    toast.success("Invoice deleted.");
    load();
  }

  const all = invoices ?? [];
  const totalInvoiced = all.reduce((s, i) => s + (i.total_amount || i.amount || 0), 0);
  const paidAmount = all.filter((i) => i.status === "paid" || i.status === "partially_paid").reduce((s, i) => s + (i.paid_amount || 0), 0);
  const pendingAmount = all.filter((i) => ["sent", "viewed", "draft", "partially_paid"].includes(i.status)).reduce((s, i) => s + (i.balance_due || 0), 0);
  const overdueAmount = all.filter((i) => i.status === "overdue").reduce((s, i) => s + (i.balance_due || 0), 0);
  const overdueCount = all.filter((i) => i.status === "overdue").length;

  return (
    <>
      <InvoiceFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditInvoice(null); }}
        onSaved={load}
        invoice={editInvoice}
      />
      <AddPaymentModal
        open={!!paymentInvoice}
        onClose={() => setPaymentInvoice(null)}
        onSaved={load}
        invoice={paymentInvoice}
      />

      <div className="min-h-screen bg-[#0f1117]">
        <div className="p-4 sm:p-6 space-y-5">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Home className="h-3 w-3" />
            <Link href="/office" className="hover:text-white transition-colors">Office</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-300">Invoices</span>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                <FileText className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Invoices</h1>
                <p className="text-sm text-slate-400">Track client billing and payments</p>
              </div>
            </div>
            <button type="button" onClick={() => { setEditInvoice(null); setModalOpen(true); }}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
              <Plus className="h-4 w-4" /> New Invoice
            </button>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Total Invoiced", amount: totalInvoiced, count: all.length, icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10", filter: "all" as const },
              { label: "Paid", amount: paidAmount, count: all.filter((i) => i.status === "paid").length, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10", filter: "paid" as const },
              { label: "Pending", amount: pendingAmount, count: all.filter((i) => ["sent","viewed","draft"].includes(i.status)).length, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10", filter: "sent" as const },
              { label: "Overdue", amount: overdueAmount, count: overdueCount, icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10", filter: "overdue" as const },
            ].map((card) => (
              <button key={card.label} type="button"
                onClick={() => setStatusFilter(statusFilter === card.filter ? "all" : card.filter)}
                className={`rounded-xl border p-4 text-left transition-all ${statusFilter === card.filter ? "border-blue-500/50 bg-blue-500/5" : "border-[#2a3045] bg-[#1a1f2e] hover:border-[#3a4055]"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400">{card.label}</span>
                  <div className={`h-7 w-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                  </div>
                </div>
                <p className={`text-xl font-bold ${card.color}`}>{fmt(card.amount)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{card.count} invoice{card.count !== 1 ? "s" : ""}</p>
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input type="text" placeholder="Search invoices..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-[#1a1f2e] border border-[#2a3045] rounded-lg text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | InvoiceStatus)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none">
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="paid">Paid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
              <option value="void">Void</option>
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : all.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 text-center gap-3">
              <FileText className="h-10 w-10 text-slate-700" />
              <div>
                <p className="text-slate-400 font-medium">No invoices yet</p>
                <p className="text-slate-600 text-sm mt-1">Create your first invoice for a client or project.</p>
              </div>
              <button type="button" onClick={() => { setEditInvoice(null); setModalOpen(true); }}
                className="flex items-center gap-2 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-4 py-2 text-sm text-slate-300 hover:border-blue-500/50 transition-colors">
                <Plus className="h-4 w-4" /> Create Invoice
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#2a3045]">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="border-b border-[#2a3045] bg-[#1a1f2e] text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Invoice No.</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Issue Date</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 w-0" />
                  </tr>
                </thead>
                <tbody>
                  {all.map((inv) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const isActuallyOverdue = inv.due_date && inv.due_date < today && (inv.balance_due || 0) > 0 && !["paid","cancelled","void"].includes(inv.status);
                    const displayStatus = isActuallyOverdue ? "overdue" : inv.status;
                    const total = inv.total_amount || inv.amount || 0;
                    const paid = inv.paid_amount || 0;
                    const balance = inv.balance_due ?? (total - paid);
                    return (
                      <tr key={inv.id}
                        onClick={() => router.push(`/office/invoices/${inv.id}`)}
                        className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors cursor-pointer">
                        <td className="px-4 py-3 font-mono text-xs text-blue-400 hover:underline">{inv.invoice_number}</td>
                        <td className="px-4 py-3 font-medium text-white">{inv.client_name || "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(inv.issue_date)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {inv.due_date ? (
                            <span className={isActuallyOverdue ? "text-red-400" : ""}>{fmtDate(inv.due_date)}</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-white">{fmt(total, inv.currency)}</td>
                        <td className="px-4 py-3 text-right text-green-400">{paid > 0 ? fmt(paid, inv.currency) : "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={balance > 0 ? "text-amber-400" : "text-slate-500"}>{fmt(balance, inv.currency)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[displayStatus]?.cls ?? ""}`}>
                            {STATUS_META[displayStatus]?.label ?? displayStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {(inv.balance_due ?? 0) > 0 && !["paid","cancelled","void"].includes(inv.status) && (
                              <button type="button" onClick={() => setPaymentInvoice(inv)}
                                className="rounded border border-[#2a3045] px-2 py-1 text-[11px] text-green-400 hover:border-green-500/30 transition-colors">
                                + Pay
                              </button>
                            )}
                            <button type="button" onClick={() => { setEditInvoice(inv); setModalOpen(true); }}
                              className="flex items-center rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-white transition-colors">
                              <Pencil className="h-3 w-3" />
                            </button>
                            {inv.status === "draft" && (
                              <button type="button" onClick={() => handleDelete(inv)}
                                className="flex items-center rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
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
