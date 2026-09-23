"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Plus, Trash2, Pencil, Loader2, Download, ChevronRight, Home } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

interface Invoice {
  id: string;
  account_id: string;
  invoice_number: string;
  client_name: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: "bg-slate-500/20 text-slate-400",
  sent: "bg-blue-500/20 text-blue-400",
  paid: "bg-green-500/20 text-green-400",
  overdue: "bg-red-500/20 text-red-400",
  cancelled: "bg-slate-600/20 text-slate-500",
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(amount);
}

function InvoiceModal({
  open, onClose, onSaved, invoice,
}: { open: boolean; onClose: () => void; onSaved: () => void; invoice: Invoice | null }) {
  const { accountId } = useAuth();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (invoice) {
      setInvoiceNumber(invoice.invoice_number);
      setClientName(invoice.client_name);
      setAmount(String(invoice.amount));
      setCurrency(invoice.currency || "INR");
      setStatus(invoice.status);
      setIssueDate(invoice.issue_date ?? "");
      setDueDate(invoice.due_date ?? "");
      setNotes(invoice.notes ?? "");
    } else {
      setInvoiceNumber(`INV-${Date.now().toString().slice(-6)}`);
      setClientName("");
      setAmount("");
      setCurrency("INR");
      setStatus("draft");
      setIssueDate(new Date().toISOString().slice(0, 10));
      setDueDate("");
      setNotes("");
    }
  }, [invoice, open]);

  async function handleSave() {
    if (!clientName.trim() || !amount) return;
    setSaving(true);
    const supabase = createClient();
    const payload = {
      account_id: accountId,
      invoice_number: invoiceNumber.trim(),
      client_name: clientName.trim(),
      amount: parseFloat(amount) || 0,
      currency,
      status,
      issue_date: issueDate || null,
      due_date: dueDate || null,
      notes: notes.trim() || null,
    };
    let error;
    if (invoice) {
      ({ error } = await supabase.from("invoices").update(payload).eq("id", invoice.id));
    } else {
      ({ error } = await supabase.from("invoices").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(invoice ? "Invoice updated." : "Invoice created.");
    onSaved();
    onClose();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-6 shadow-xl mx-4">
        <h2 className="text-lg font-semibold text-white mb-4">{invoice ? "Edit Invoice" : "New Invoice"}</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Invoice #</label>
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Client Name *</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client or company name"
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Amount *</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Issue Date</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="w-full rounded-lg border border-[#2a3045] bg-[#0f1117] px-3 py-2 text-sm text-slate-300 focus:border-teal-500 focus:outline-none resize-none" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-[#2a3045] text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving || !clientName.trim() || !amount}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-sm text-white hover:bg-teal-500 disabled:opacity-50 transition-colors">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {invoice ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const { accountId } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (!error) setInvoices(data ?? []);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this invoice?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast.error("Could not delete."); return; }
    toast.success("Invoice deleted.");
    load();
  }

  const all = invoices ?? [];
  const visible = statusFilter === "all" ? all : all.filter((i) => i.status === statusFilter);
  const totalAmount = all.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const pendingAmount = all.filter((i) => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <InvoiceModal open={modalOpen} onClose={() => { setModalOpen(false); setEditInvoice(null); }} onSaved={load} invoice={editInvoice} />

      <div className="min-h-screen bg-[#0f1117]">
        <div className="p-6 space-y-5">
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/20">
                <FileText className="h-5 w-5 text-teal-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Invoices</h1>
                <p className="text-sm text-slate-400">Track and manage client invoices</p>
              </div>
            </div>
            <button type="button" onClick={() => { setEditInvoice(null); setModalOpen(true); }}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 transition-colors">
              <Plus className="h-4 w-4" /> New Invoice
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
              <p className="text-2xl font-bold text-white">{all.length}</p>
              <p className="text-sm text-slate-400">Total Invoices</p>
            </div>
            <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
              <p className="text-2xl font-bold text-green-400">{all.filter((i) => i.status === "paid").length}</p>
              <p className="text-sm text-slate-400">Paid</p>
            </div>
            <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
              <p className="text-lg font-bold text-green-400">{formatCurrency(totalAmount, "INR")}</p>
              <p className="text-sm text-slate-400">Amount Received</p>
            </div>
            <div className="rounded-xl border border-[#2a3045] bg-[#1a1f2e] p-4">
              <p className="text-lg font-bold text-yellow-400">{formatCurrency(pendingAmount, "INR")}</p>
              <p className="text-sm text-slate-400">Pending Amount</p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | InvoiceStatus)}
              className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-teal-500 focus:outline-none">
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-20 text-center gap-3">
              <FileText className="h-10 w-10 text-slate-700" />
              <p className="text-slate-500 text-sm">No invoices yet.</p>
              <button type="button" onClick={() => { setEditInvoice(null); setModalOpen(true); }}
                className="flex items-center gap-2 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-4 py-2 text-sm text-slate-300 hover:border-teal-500/50 transition-colors">
                <Plus className="h-4 w-4" /> Create first invoice
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#2a3045]">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[#2a3045] bg-[#1a1f2e] text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">Invoice #</th>
                    <th className="px-4 py-2.5">Client</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Issue Date</th>
                    <th className="px-4 py-2.5">Due Date</th>
                    <th className="px-4 py-2.5 w-0" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((inv) => {
                    const isOverdue = inv.status !== "paid" && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={inv.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{inv.invoice_number}</td>
                        <td className="px-4 py-3 font-medium text-white">{inv.client_name}</td>
                        <td className="px-4 py-3 font-medium text-white">{formatCurrency(inv.amount, inv.currency)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLOR[inv.status]}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {inv.issue_date ? new Date(inv.issue_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {inv.due_date ? (
                            <span className={isOverdue ? "text-red-400" : "text-slate-400"}>
                              {new Date(inv.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => { setEditInvoice(inv); setModalOpen(true); }}
                              className="flex items-center rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-white transition-colors">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => handleDelete(inv.id)}
                              className="flex items-center rounded border border-[#2a3045] px-2 py-1 text-[11px] text-slate-400 hover:text-red-400 hover:border-red-500/30 transition-colors">
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
