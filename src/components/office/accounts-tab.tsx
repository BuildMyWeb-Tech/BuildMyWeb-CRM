"use client";

import { useCallback, useEffect, useState } from "react";
import type { Client, ClientPayment, AccountMember } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, IndianRupee, Users2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// Account Management — client payments + how each one splits across
// the company and team members. Modeled on the "Client Amount"
// Excel sheet BMW shared: one row per payment, then a per-recipient
// breakdown for that payment (see 052_client_payments.sql for the
// normalized schema this maps to). Admin-only end to end.

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
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [payments, setPayments] = useState<ClientPayment[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [clientFilter, setClientFilter] = useState<string>("__all__");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formClientId, setFormClientId] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [amount, setAmount] = useState("");
  const [domainFee, setDomainFee] = useState("");
  const [hostingFee, setHostingFee] = useState("");
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
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  function openNewPayment() {
    setFormClientId("");
    setServiceDescription("");
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setDomainFee("");
    setHostingFee("");
    setNotes("");
    setAllocations([emptyAllocation()]);
    setDialogOpen(true);
  }

  function updateAllocation(index: number, patch: Partial<AllocationDraft>) {
    setAllocations((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function addAllocation() {
    setAllocations((prev) => [...prev, emptyAllocation()]);
  }

  function removeAllocation(index: number) {
    setAllocations((prev) => prev.filter((_, i) => i !== index));
  }

  const allocatedTotal = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  async function handleSave() {
    if (!formClientId || !receivedDate || !amount) return;
    setSaving(true);
    try {
      const res = await fetch("/api/client-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: formClientId,
          service_description: serviceDescription.trim() || null,
          received_date: receivedDate,
          amount: Number(amount),
          domain_fee: domainFee ? Number(domainFee) : null,
          hosting_fee: hostingFee ? Number(hostingFee) : null,
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
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "Could not save payment.");
        return;
      }
      setDialogOpen(false);
      loadPayments();
      toast.success("Payment recorded.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this payment record? This can't be undone.")) return;
    const res = await fetch(`/api/client-payments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete payment.");
      return;
    }
    loadPayments();
    toast.success("Payment deleted.");
  }

  // --- Summary cards ---
  const totalRevenue = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const totalCompanyShare = (payments ?? []).reduce(
    (sum, p) => sum + (p.allocations ?? []).filter((a) => a.recipient_type === "company").reduce((s, a) => s + Number(a.amount), 0),
    0,
  );
  const perPersonTotals = new Map<string, number>();
  for (const p of payments ?? []) {
    for (const a of p.allocations ?? []) {
      if (a.recipient_type === "team_member" && a.recipient_user_id) {
        perPersonTotals.set(a.recipient_user_id, (perPersonTotals.get(a.recipient_user_id) ?? 0) + Number(a.amount));
      }
    }
  }
  const leaderboard = [...perPersonTotals.entries()]
    .map(([userId, total]) => ({
      userId,
      total,
      name: members.find((m) => m.user_id === userId)?.full_name ?? "Unknown",
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <IndianRupee className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Revenue</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Company Share</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(totalCompanyShare)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
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

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
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
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border-border bg-muted text-foreground" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border-border bg-muted text-foreground" />
          </div>
        </div>
        <Button onClick={openNewPayment}>
          <Plus className="mr-1.5 h-4 w-4" />
          New payment
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !payments || payments.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Allocated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const allocatedSum = (p.allocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-3 py-2 text-muted-foreground">{new Date(p.received_date).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-foreground">{p.client?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.service_description ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-foreground">{formatCurrency(Number(p.amount))}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrency(allocatedSum)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(p.id)} className="text-muted-foreground hover:text-red-400">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-popover border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">New payment</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Client</Label>
              <Select value={formClientId} onValueChange={(v) => v && setFormClientId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate">
                    {(v: string) => clients.find((c) => c.id === v)?.name ?? "Select a client"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Service</Label>
              <Input value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="e.g. Logo, Website, Digital Marketing" className="border-border bg-muted text-foreground" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Received date</Label>
                <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Amount</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Domain fee (optional)</Label>
                <Input type="number" value={domainFee} onChange={(e) => setDomainFee(e.target.value)} className="border-border bg-muted text-foreground" />
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Hosting fee (optional)</Label>
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
                        <SelectValue className="truncate capitalize">{(v: string) => (v === "team_member" ? "Team" : "Company")}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team_member">Team member</SelectItem>
                        <SelectItem value="company">Company</SelectItem>
                      </SelectContent>
                    </Select>
                    {a.recipient_type === "team_member" && (
                      <Select value={a.recipient_user_id} onValueChange={(v) => v && updateAllocation(i, { recipient_user_id: v })}>
                        <SelectTrigger className="w-28 shrink-0">
                          <SelectValue className="truncate">
                            {(v: string) => members.find((m) => m.user_id === v)?.full_name ?? "Who"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                          ))}
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
                    <Button variant="ghost" size="icon-xs" onClick={() => removeAllocation(i)} className="shrink-0 text-muted-foreground hover:text-red-400">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addAllocation} className="w-fit">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add allocation
              </Button>
            </div>
          </div>

          <DialogFooter className="border-border bg-popover/50">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formClientId || !receivedDate || !amount}>
              {saving ? "Saving…" : "Save payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
