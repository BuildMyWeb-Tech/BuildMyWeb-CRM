"use client";

import { useCallback, useEffect, useState } from "react";
import type { Client, ClientPayment, AccountMember, Project, PaymentStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, IndianRupee, Users2, TrendingUp, Clock } from "lucide-react";
import { toast } from "sonner";

// Account Management — client payments + how each one splits across
// the company and team members. Includes past payments and future
// expected/scheduled payments.

const PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled', 'refunded'];
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};
const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  paid: 'bg-primary/10 text-primary',
  pending: 'bg-amber-500/15 text-amber-500',
  partially_paid: 'bg-blue-500/15 text-blue-400',
  overdue: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
  refunded: 'bg-purple-500/15 text-purple-400',
};
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card', 'Online', 'Other'];

type AccountsInnerTab = 'overview' | 'payments' | 'expected';

interface AllocationDraft {
  recipient_type: "company" | "team_member";
  recipient_user_id: string;
  role_label: string;
  amount: string;
}

function emptyAllocation(): AllocationDraft {
  return { recipient_type: "team_member", recipient_user_id: "", role_label: "", amount: "" };
}

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function AccountsTab() {
  const [innerTab, setInnerTab] = useState<AccountsInnerTab>('overview');
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<ClientPayment[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [clientFilter, setClientFilter] = useState<string>("__all__");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formClientId, setFormClientId] = useState("");
  const [formProjectId, setFormProjectId] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [amount, setAmount] = useState("");
  const [domainFee, setDomainFee] = useState("");
  const [hostingFee, setHostingFee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<AllocationDraft[]>([emptyAllocation()]);

  const loadPayments = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (clientFilter !== "__all__") params.set("client_id", clientFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    fetch(`/api/client-payments?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPayments(data?.payments ?? []))
      .catch((err) => console.error("[accounts] load payments failed:", err))
      .finally(() => setLoading(false));
  }, [clientFilter, fromDate, toDate]);

  useEffect(() => {
    fetch("/api/clients").then((r) => (r.ok ? r.json() : null)).then((d) => setClients(d?.clients ?? []));
    fetch("/api/account/members").then((r) => (r.ok ? r.json() : null)).then((d) => setMembers(d?.members ?? []));
    fetch("/api/projects").then((r) => (r.ok ? r.json() : null)).then((d) => setProjects(d?.projects ?? []));
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  function resetForm() {
    setEditingId(null);
    setFormClientId("");
    setFormProjectId("");
    setServiceDescription("");
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setExpectedDate("");
    setAmount("");
    setDomainFee("");
    setHostingFee("");
    setPaymentMethod("");
    setTransactionId("");
    setPaymentStatus("paid");
    setNotes("");
    setAllocations([emptyAllocation()]);
  }

  function openNewPayment(isExpected = false) {
    resetForm();
    if (isExpected) {
      setPaymentStatus("pending");
      setReceivedDate("");
    }
    setDialogOpen(true);
  }

  function openEditPayment(p: ClientPayment) {
    setEditingId(p.id);
    setFormClientId(p.client_id);
    setFormProjectId(p.project_id ?? "");
    setServiceDescription(p.service_description ?? "");
    setReceivedDate(p.received_date ?? "");
    setExpectedDate(p.expected_date ?? "");
    setAmount(String(p.amount));
    setDomainFee(p.domain_fee != null ? String(p.domain_fee) : "");
    setHostingFee(p.hosting_fee != null ? String(p.hosting_fee) : "");
    setPaymentMethod(p.payment_method ?? "");
    setTransactionId(p.transaction_id ?? "");
    setPaymentStatus(p.status ?? "paid");
    setNotes(p.notes ?? "");
    setAllocations(
      (p.allocations ?? []).length > 0
        ? (p.allocations ?? []).map((a) => ({
            recipient_type: a.recipient_type,
            recipient_user_id: a.recipient_user_id ?? "",
            role_label: a.role_label ?? "",
            amount: String(a.amount),
          }))
        : [emptyAllocation()],
    );
    setDialogOpen(true);
  }

  function updateAllocation(index: number, patch: Partial<AllocationDraft>) {
    setAllocations((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  const allocatedTotal = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  async function handleSave() {
    if (!formClientId || !amount) return;
    setSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/client-payments/${editingId}` : "/api/client-payments",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: formClientId,
            project_id: formProjectId || null,
            service_description: serviceDescription.trim() || null,
            received_date: receivedDate || null,
            expected_date: expectedDate || null,
            amount: Number(amount),
            domain_fee: domainFee ? Number(domainFee) : null,
            hosting_fee: hostingFee ? Number(hostingFee) : null,
            payment_method: paymentMethod || null,
            transaction_id: transactionId.trim() || null,
            status: paymentStatus,
            notes: notes.trim() || null,
            allocations: allocations
              .filter((a) => a.amount)
              .map((a) => ({
                recipient_type: a.recipient_type,
                recipient_user_id: a.recipient_type === "team_member" ? a.recipient_user_id : null,
                role_label: a.role_label.trim() || null,
                amount: Number(a.amount),
              })),
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not save payment.");
        return;
      }
      setDialogOpen(false);
      loadPayments();
      toast.success(editingId ? "Payment updated." : "Payment recorded.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this payment record? This can't be undone.")) return;
    const res = await fetch(`/api/client-payments/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete payment."); return; }
    loadPayments();
    toast.success("Payment deleted.");
  }

  // ── Summary stats ───────────────────────────────────────────────────────
  const allPayments = payments ?? [];
  const received = allPayments.filter((p) => p.status === 'paid' || p.status === 'partially_paid');
  const pending = allPayments.filter((p) => p.status === 'pending');
  const overdue = allPayments.filter((p) => p.status === 'overdue');
  const expected = allPayments.filter((p) => p.expected_date && p.status !== 'paid' && p.status !== 'cancelled');
  const totalRevenue = received.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = pending.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalOverdue = overdue.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalExpected = expected.reduce((sum, p) => sum + Number(p.amount), 0);

  const totalCompanyShare = allPayments.reduce(
    (sum, p) => sum + (p.allocations ?? []).filter((a) => a.recipient_type === "company").reduce((s, a) => s + Number(a.amount), 0),
    0,
  );
  const perPersonTotals = new Map<string, number>();
  for (const p of allPayments) {
    for (const a of p.allocations ?? []) {
      if (a.recipient_type === "team_member" && a.recipient_user_id) {
        perPersonTotals.set(a.recipient_user_id, (perPersonTotals.get(a.recipient_user_id) ?? 0) + Number(a.amount));
      }
    }
  }
  const leaderboard = [...perPersonTotals.entries()]
    .map(([userId, total]) => ({ userId, total, name: members.find((m) => m.user_id === userId)?.full_name ?? "Unknown" }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Shown rows per tab
  const visiblePayments = innerTab === 'expected'
    ? allPayments.filter((p) => p.status !== 'paid' && p.status !== 'cancelled' && p.status !== 'refunded')
    : allPayments.filter((p) => p.status === 'paid' || p.status === 'partially_paid');

  return (
    <div className="mt-4">
      {/* Inner tab bar */}
      <div className="flex items-center gap-0 border-b border-border">
        {(['overview', 'payments', 'expected'] as AccountsInnerTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setInnerTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
              innerTab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'expected' ? 'Expected Payments' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Overview tab ───────────────────────────────────────────── */}
      {innerTab === 'overview' && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <IndianRupee className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Total Revenue</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Pending</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-amber-500">{formatCurrency(totalPending)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Company Share</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(totalCompanyShare)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <IndianRupee className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Expected</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-blue-400">{formatCurrency(totalExpected)}</p>
            </div>
          </div>

          {/* Expected payments card */}
          {expected.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Upcoming Expected Payments</p>
              <div className="space-y-2">
                {expected.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-foreground">{p.client?.name ?? "—"}</span>
                      {p.service_description && <span className="ml-2 text-muted-foreground">· {p.service_description}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground">{p.expected_date ? new Date(p.expected_date).toLocaleDateString() : "—"}</span>
                      <span className="font-medium text-foreground">{formatCurrency(Number(p.amount))}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_STATUS_STYLE[p.status]}`}>
                        {PAYMENT_STATUS_LABEL[p.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-muted-foreground">
              <Users2 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Top Earners</span>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No allocations yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {leaderboard.map((l) => (
                  <div key={l.userId} className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{l.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatCurrency(l.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Payments / Expected tabs ─────────────────────────────────── */}
      {(innerTab === 'payments' || innerTab === 'expected') && (
        <div className="mt-4 space-y-4">
          {/* Stats for this view */}
          {innerTab === 'expected' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Expected</p>
                <p className="mt-1 text-xl font-bold text-blue-400">{formatCurrency(totalExpected)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Overdue</p>
                <p className="mt-1 text-xl font-bold text-red-400">{formatCurrency(totalOverdue)}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pending</p>
                <p className="mt-1 text-xl font-bold text-amber-500">{formatCurrency(totalPending)}</p>
              </div>
            </div>
          )}

          {/* Filters + New button */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Client</Label>
                <Select value={clientFilter} onValueChange={(v) => v && setClientFilter(v)}>
                  <SelectTrigger className="w-44">
                    <SelectValue className="truncate">
                      {(v: string) => (v === "__all__" ? "All clients" : clients.find((c) => c.id === v)?.name ?? "All clients")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All clients</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {innerTab === 'payments' && (
                <>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border-border bg-muted text-foreground" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border-border bg-muted text-foreground" />
                  </div>
                </>
              )}
            </div>
            <Button onClick={() => openNewPayment(innerTab === 'expected')}>
              <Plus className="mr-1.5 h-4 w-4" />
              {innerTab === 'expected' ? 'Add expected payment' : 'New payment'}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : visiblePayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-14 text-center">
              <p className="text-sm text-muted-foreground">
                {innerTab === 'expected' ? 'No expected payments.' : 'No payments recorded yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">{innerTab === 'expected' ? 'Expected date' : 'Date'}</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Service</th>
                    {innerTab === 'payments' && <th className="px-3 py-2">Method</th>}
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.map((p) => {
                    return (
                      <tr
                        key={p.id}
                        onClick={() => openEditPayment(p)}
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-3 py-2 text-muted-foreground">
                          {innerTab === 'expected'
                            ? (p.expected_date ? new Date(p.expected_date).toLocaleDateString() : "—")
                            : (p.received_date ? new Date(p.received_date).toLocaleDateString() : "—")}
                        </td>
                        <td className="px-3 py-2 text-foreground">{p.client?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.service_description ?? "—"}</td>
                        {innerTab === 'payments' && <td className="px-3 py-2 capitalize text-muted-foreground">{p.payment_method ?? "—"}</td>}
                        <td className="px-3 py-2 text-right font-medium text-foreground">{formatCurrency(Number(p.amount))}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PAYMENT_STATUS_STYLE[p.status] ?? 'bg-muted text-muted-foreground'}`}>
                            {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                            className="text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Payment dialog ───────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-popover border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{editingId ? "Edit payment" : "New payment"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Client</Label>
                <Select value={formClientId} onValueChange={(v) => v && setFormClientId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue className="truncate">{(v: string) => clients.find((c) => c.id === v)?.name ?? "Select a client"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Project (optional)</Label>
                <Select value={formProjectId || "__none__"} onValueChange={(v) => setFormProjectId(!v || v === "__none__" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue className="truncate">{(v: string) => projects.find((p) => p.id === v)?.name ?? "No project"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No project</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Service</Label>
              <Input value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="e.g. Logo, Website, Digital Marketing" className="border-border bg-muted text-foreground" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Status</Label>
                <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
                  <SelectTrigger className="w-full"><SelectValue>{(v: string) => PAYMENT_STATUS_LABEL[v as PaymentStatus] ?? v}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Amount</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Received date</Label>
                <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Expected date</Label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Payment method</Label>
                <Select value={paymentMethod || "__none__"} onValueChange={(v) => setPaymentMethod(!v || v === "__none__" ? "" : v)}>
                  <SelectTrigger className="w-full"><SelectValue>{(v: string) => v === "__none__" ? "Select method" : v}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select method</SelectItem>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Transaction ID</Label>
                <Input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Optional" className="border-border bg-muted text-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Domain fee</Label>
                <Input type="number" value={domainFee} onChange={(e) => setDomainFee(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Hosting fee</Label>
                <Input type="number" value={hostingFee} onChange={(e) => setHostingFee(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="border-border bg-muted text-foreground" rows={2} />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground">Allocations</Label>
                <span className="text-xs text-muted-foreground">
                  Allocated: {formatCurrency(allocatedTotal)}{amount ? ` of ${formatCurrency(Number(amount))}` : ""}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {allocations.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2">
                    <Select
                      value={a.recipient_type}
                      onValueChange={(v) => v && updateAllocation(i, { recipient_type: v as "company" | "team_member", recipient_user_id: "" })}
                    >
                      <SelectTrigger className="w-32 shrink-0">
                        <SelectValue className="capitalize">{(v: string) => (v === "team_member" ? "Team" : "Company")}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team_member">Team member</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                      </SelectContent>
                    </Select>
                    {a.recipient_type === "team_member" && (
                      <Select value={a.recipient_user_id} onValueChange={(v) => v && updateAllocation(i, { recipient_user_id: v })}>
                        <SelectTrigger className="w-28 shrink-0">
                          <SelectValue className="truncate">{(v: string) => members.find((m) => m.user_id === v)?.full_name ?? "Who"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      value={a.role_label}
                      onChange={(e) => updateAllocation(i, { role_label: e.target.value })}
                      placeholder="Role (optional)"
                      className="h-8 flex-1 border-transparent bg-transparent text-sm text-foreground focus:border-border"
                    />
                    <Input
                      type="number"
                      value={a.amount}
                      onChange={(e) => updateAllocation(i, { amount: e.target.value })}
                      placeholder="Amount"
                      className="h-8 w-24 shrink-0 border-transparent bg-transparent text-sm text-foreground focus:border-border"
                    />
                    <Button variant="ghost" size="icon-xs" onClick={() => setAllocations((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 text-muted-foreground hover:text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setAllocations((prev) => [...prev, emptyAllocation()])} className="w-fit">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add allocation
              </Button>
            </div>
          </div>

          <DialogFooter className="border-border bg-popover/50">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formClientId || !amount}>
              {saving ? "Saving…" : editingId ? "Update payment" : "Save payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
