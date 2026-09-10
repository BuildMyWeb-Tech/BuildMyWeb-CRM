"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Upload, ImageIcon, Check, X, Plus, Trash2,
  Phone, Mail, Globe, Building2, Calendar, User, MessageSquare,
  Folder, Briefcase, FileText, CreditCard, StickyNote,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CombinedFilesView } from "@/components/files/combined-files-view";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { ScopeOfWorkSection } from "@/components/clients/scope-of-work-section";
import { useAuth } from "@/hooks/use-auth";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type {
  Client, ClientStatus, ClientNote, ClientPayment, Project,
  ScopeOfWork, AccountMember,
} from "@/types";
import { toast } from "sonner";

type C360Tab = "overview" | "projects" | "tasks" | "files" | "payments" | "notes" | "info" | "scope";

const STATUSES: ClientStatus[] = ["active", "inactive", "archived"];
const STATUS_STYLE: Record<ClientStatus, string> = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-amber-500/15 text-amber-500",
  archived: "bg-muted text-muted-foreground",
};
const ACCENT_COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
];
const PAYMENT_STATUS_STYLE: Record<string, string> = {
  paid: "bg-primary/10 text-primary",
  pending: "bg-amber-500/15 text-amber-500",
  partially_paid: "bg-blue-500/15 text-blue-400",
  overdue: "bg-red-500/15 text-red-400",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-purple-500/15 text-purple-400",
};

function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function TabButton({
  active, onClick, icon: Icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const { accountId, user, canManageMembers, canUpdateRecords, canSendMessages } = useAuth();
  const { canUpdate: gridCanUpdate, canCreate: gridCanCreate } = usePagePermissions("client_directory");
  const canEditInfo = canUpdateRecords && gridCanUpdate;
  const canCreateScope = canSendMessages && gridCanCreate;
  const [tab, setTab] = useState<C360Tab>("overview");

  const [client, setClient] = useState<Client | null>(null);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeOfWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [accentColor, setAccentColor] = useState<string>(ACCENT_COLORS[0]);

  // Lazy per-tab data
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [payments, setPayments] = useState<ClientPayment[] | null>(null);
  const [notes, setNotes] = useState<ClientNote[] | null>(null);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Field editing
  type InfoField = "name" | "interface_name" | "interface_contact_number" | "client_since" | "notes" | "industry" | "phone" | "email";
  const [editingField, setEditingField] = useState<InfoField | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [editingOwner, setEditingOwner] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState(false);
  const [followUpValue, setFollowUpValue] = useState("");

  const load = useCallback(() => {
    fetch(`/api/clients/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (!data) return;
        setClient(data.client);
        setScopeItems(data.scopeOfWork ?? []);
        setAccentColor(data.client.accent_color ?? ACCENT_COLORS[0]);
        if (data.client.logo_storage_path) {
          const supabase = createSupabaseClient();
          const { data: signed } = await supabase.storage
            .from("files")
            .createSignedUrl(data.client.logo_storage_path, 3600);
          setLogoUrl(signed?.signedUrl ?? null);
        } else {
          setLogoUrl(null);
        }
      })
      .catch((err) => console.error("[client-360] load failed:", err))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
    fetch("/api/account/members").then((r) => r.ok ? r.json() : null).then((d) => setMembers(d?.members ?? []));
  }, [load]);

  // Lazy load per tab
  useEffect(() => {
    if (tab === "projects" && projects === null) {
      fetch(`/api/projects?client_id=${params.id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => setProjects(d?.projects ?? []));
    }
    if (tab === "payments" && payments === null) {
      fetch(`/api/client-payments?client_id=${params.id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => setPayments(d?.payments ?? []));
    }
    if (tab === "notes" && notes === null) {
      fetch(`/api/client-notes?client_id=${params.id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => setNotes(d?.notes ?? []));
    }
  }, [tab, params.id, projects, payments, notes]);

  async function saveField(field: InfoField, value: string) {
    if (!client) return;
    setSavingField(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value.trim() || null }),
      });
      if (!res.ok) { toast.error("Could not save."); return; }
      setClient({ ...client, [field]: value.trim() || null } as Client);
      setEditingField(null);
      toast.success("Updated.");
    } finally {
      setSavingField(false);
    }
  }

  async function saveStatus(next: ClientStatus) {
    if (!client) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) { toast.error("Could not save."); return; }
      setClient({ ...client, status: next });
      setEditingStatus(false);
      toast.success("Status updated.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveOwner(userId: string | null) {
    if (!client) return;
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner_user_id: userId }),
    });
    if (!res.ok) { toast.error("Could not save."); return; }
    setClient({ ...client, owner_user_id: userId });
    setEditingOwner(false);
    toast.success("Owner updated.");
  }

  async function saveFollowUp() {
    if (!client) return;
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ next_follow_up_at: followUpValue || null }),
    });
    if (!res.ok) { toast.error("Could not save."); return; }
    setClient({ ...client, next_follow_up_at: followUpValue || null });
    setEditingFollowUp(false);
    toast.success("Follow-up updated.");
  }

  async function saveAccentColor(color: string) {
    if (!client) return;
    setAccentColor(color);
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accent_color: color }),
    });
    if (!res.ok) { toast.error("Could not save accent color."); return; }
    setClient({ ...client, accent_color: color });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !client || !accountId) return;
    setUploadingLogo(true);
    try {
      const supabase = createSupabaseClient();
      const path = `${accountId}/client-logos/${client.id}-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("files").upload(path, file, { upsert: true });
      if (uploadError) { toast.error(`Upload failed: ${uploadError.message}`); return; }
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_storage_path: path }),
      });
      if (!res.ok) { toast.error("Logo uploaded but could not be saved."); return; }
      const { data: signed } = await supabase.storage.from("files").createSignedUrl(path, 3600);
      setLogoUrl(signed?.signedUrl ?? null);
      toast.success("Logo updated.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function addNote() {
    if (!client || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/client-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: client.id, note_text: newNote.trim() }),
      });
      if (!res.ok) { toast.error("Could not save note."); return; }
      const data = await res.json();
      setNotes((prev) => [data.note, ...(prev ?? [])]);
      setNewNote("");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(id: string) {
    const res = await fetch(`/api/client-notes/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not delete note."); return; }
    setNotes((prev) => (prev ?? []).filter((n) => n.id !== id));
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">Client not found.</p>
        <Link href="/clients">
          <Button variant="outline" size="sm">Back to Client Directory</Button>
        </Link>
      </div>
    );
  }

  const owner = members.find((m) => m.user_id === client.owner_user_id);

  return (
    <div>
      {/* ── Back + Header ───────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Link
          href="/clients"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3">
          {/* Logo */}
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`${client.name} logo`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            {canEditInfo && (
              <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100">
                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Upload className="h-4 w-4 text-white" />}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={handleLogoUpload} />
              </label>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{client.name}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[client.status]}`}
                style={{ borderLeft: `3px solid ${accentColor}` }}
              >
                {client.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {client.industry && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />{client.industry}
                </span>
              )}
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Phone className="h-3 w-3" />{client.phone}
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Mail className="h-3 w-3" />{client.email}
                </a>
              )}
              {owner && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />Owner: {owner.full_name}
                </span>
              )}
              {client.next_follow_up_at && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Follow-up: {new Date(client.next_follow_up_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Quick actions */}
          {(client.phone || client.email) && (
            <div className="flex items-center gap-1.5">
              {client.phone && (
                <a href={`tel:${client.phone}`} title="Call">
                  <Button variant="outline" size="icon-xs"><Phone className="h-3.5 w-3.5" /></Button>
                </a>
              )}
              {client.phone && (
                <a href={`https://wa.me/${client.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" title="WhatsApp">
                  <Button variant="outline" size="icon-xs">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </a>
              )}
              {client.email && (
                <a href={`mailto:${client.email}`} title="Email">
                  <Button variant="outline" size="icon-xs"><Mail className="h-3.5 w-3.5" /></Button>
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center gap-0 overflow-x-auto border-b border-border scrollbar-none">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={Globe}>Overview</TabButton>
        <TabButton active={tab === "projects"} onClick={() => setTab("projects")} icon={Briefcase}>Projects</TabButton>
        <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={Folder}>Files</TabButton>
        <TabButton active={tab === "payments"} onClick={() => setTab("payments")} icon={CreditCard}>Payments</TabButton>
        <TabButton active={tab === "notes"} onClick={() => setTab("notes")} icon={StickyNote}>Notes</TabButton>
        <TabButton active={tab === "info"} onClick={() => setTab("info")} icon={FileText}>Info</TabButton>
        <TabButton active={tab === "scope"} onClick={() => setTab("scope")} icon={Briefcase}>Scope</TabButton>
      </div>

      {/* ── Overview ────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Client since</p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {client.client_since ? new Date(client.client_since).toLocaleDateString() : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Industry</p>
              <p className="mt-1 text-base font-semibold text-foreground">{client.industry ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Owner</p>
              <p className="mt-1 text-base font-semibold text-foreground">{owner?.full_name ?? "Unassigned"}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Next follow-up</p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {client.next_follow_up_at ? new Date(client.next_follow_up_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>

          {client.notes && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{client.notes}</p>
            </div>
          )}

          {accountId && user && (
            <CustomFieldsSection
              accountId={accountId}
              currentUserId={user.id}
              entityType="client"
              entityId={client.id}
              isAdmin={canManageMembers}
              canEdit={canEditInfo}
            />
          )}
        </div>
      )}

      {/* ── Projects ────────────────────────────────────────────────── */}
      {tab === "projects" && (
        <div className="mt-4">
          {projects === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
              No projects linked to this client.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="block">
                  <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-foreground">{p.name}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${p.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{p.status}</span>
                    </div>
                    {p.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
                    {typeof p.progress_percentage === "number" && p.progress_percentage > 0 && (
                      <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress_percentage}%` }} />
                        </div>
                        <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{p.progress_percentage}%</p>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Files ───────────────────────────────────────────────────── */}
      {tab === "files" && accountId && user && (
        <div className="mt-4">
          <CombinedFilesView accountId={accountId} userId={user.id} clientId={client.id} />
        </div>
      )}

      {/* ── Payments ────────────────────────────────────────────────── */}
      {tab === "payments" && (
        <div className="mt-4">
          {payments === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : payments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(() => {
                  const received = payments.filter((p) => p.status === "paid" || p.status === "partially_paid").reduce((s, p) => s + Number(p.amount), 0);
                  const pending = payments.filter((p) => p.status === "pending").reduce((s, p) => s + Number(p.amount), 0);
                  const overdue = payments.filter((p) => p.status === "overdue").reduce((s, p) => s + Number(p.amount), 0);
                  const expected = payments.filter((p) => p.expected_date && p.status !== "paid").reduce((s, p) => s + Number(p.amount), 0);
                  return (
                    <>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Received</p>
                        <p className="mt-1 text-lg font-bold text-primary">{formatCurrency(received)}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pending</p>
                        <p className="mt-1 text-lg font-bold text-amber-500">{formatCurrency(pending)}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Overdue</p>
                        <p className="mt-1 text-lg font-bold text-red-400">{formatCurrency(overdue)}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Expected</p>
                        <p className="mt-1 text-lg font-bold text-blue-400">{formatCurrency(expected)}</p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Service</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.received_date
                            ? new Date(p.received_date).toLocaleDateString()
                            : p.expected_date
                            ? `Expected ${new Date(p.expected_date).toLocaleDateString()}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-foreground">{p.service_description ?? "—"}</td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">{p.payment_method ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{formatCurrency(Number(p.amount))}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PAYMENT_STATUS_STYLE[p.status] ?? "bg-muted text-muted-foreground"}`}>
                            {p.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Notes ───────────────────────────────────────────────────── */}
      {tab === "notes" && (
        <div className="mt-4 space-y-3">
          {canEditInfo && (
            <div className="flex gap-2">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note…"
                className="border-border bg-muted text-foreground"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addNote();
                  }
                }}
              />
              <Button onClick={addNote} disabled={savingNote || !newNote.trim()} className="shrink-0">
                {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          )}
          {notes === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : notes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
              No notes yet.
            </div>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="group relative rounded-lg border border-border bg-card p-3">
                <p className="whitespace-pre-wrap text-sm text-foreground">{n.note_text}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {n.author?.full_name ?? "Unknown"} · {new Date(n.created_at).toLocaleDateString()}
                  </p>
                  {canEditInfo && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => deleteNote(n.id)}
                      className="opacity-0 text-muted-foreground hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Info ────────────────────────────────────────────────────── */}
      {tab === "info" && (
        <div className="mt-4 flex max-w-lg flex-col gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={`${client.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Logo</p>
              {canEditInfo && (
                <label className="mt-1 flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                  {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {logoUrl ? "Replace logo" : "Upload logo"}
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={handleLogoUpload} />
                </label>
              )}
            </div>
          </div>

          {/* Accent color */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Accent color</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  disabled={!canEditInfo}
                  onClick={() => saveAccentColor(color)}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 disabled:pointer-events-none"
                  style={{ backgroundColor: color, borderColor: accentColor === color ? "var(--foreground)" : "transparent" }}
                />
              ))}
            </div>
          </div>

          {/* Editable text fields */}
          {(
            [
              ["name", "Name"],
              ["industry", "Industry"],
              ["phone", "Phone"],
              ["email", "Email"],
              ["interface_name", "Client interface name"],
              ["interface_contact_number", "Interface contact number"],
              ["client_since", "Client since"],
              ["notes", "Notes (summary)"],
            ] as [InfoField, string][]
          ).map(([field, label]) => (
            <div key={field} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                {editingField === field ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      type={field === "client_since" ? "date" : field === "email" ? "email" : "text"}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      autoFocus
                      className="h-8 border-border bg-muted text-sm text-foreground"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveField(field, editingValue);
                        if (e.key === "Escape") setEditingField(null);
                      }}
                    />
                    <Button variant="ghost" size="icon-xs" onClick={() => saveField(field, editingValue)} disabled={savingField} className="shrink-0 text-emerald-500 hover:text-emerald-400">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setEditingField(null)} disabled={savingField} className="shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="mt-0.5 text-sm text-foreground">
                    {(client[field as keyof Client] as string)?.trim()
                      ? field === "client_since"
                        ? new Date(client[field as keyof Client] as string).toLocaleDateString()
                        : (client[field as keyof Client] as string)
                      : <span className="text-muted-foreground">Not set</span>}
                  </p>
                )}
              </div>
              {canEditInfo && editingField !== field && (
                <button
                  type="button"
                  onClick={() => { setEditingField(field); setEditingValue((client[field as keyof Client] as string) ?? ""); }}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
          ))}

          {/* Status */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            {editingStatus ? (
              <div className="mt-1 flex items-center gap-2">
                <Select value={client.status} onValueChange={(v) => v && saveStatus(v as ClientStatus)} disabled={savingStatus}>
                  <SelectTrigger className="h-8 w-full"><SelectValue className="capitalize">{(v: string) => v}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon-xs" onClick={() => setEditingStatus(false)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-0.5 flex items-center justify-between">
                <p className="text-sm capitalize text-foreground">{client.status}</p>
                {canEditInfo && <button type="button" onClick={() => setEditingStatus(true)} className="text-xs text-primary hover:underline">Edit</button>}
              </div>
            )}
          </div>

          {/* Owner */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Owner</p>
            {editingOwner ? (
              <div className="mt-1 flex items-center gap-2">
                <Select value={client.owner_user_id ?? "__none__"} onValueChange={(v) => saveOwner(v === "__none__" ? null : v)}>
                  <SelectTrigger className="h-8 w-full"><SelectValue className="truncate">{(v: string) => members.find((m) => m.user_id === v)?.full_name ?? "Unassigned"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon-xs" onClick={() => setEditingOwner(false)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-0.5 flex items-center justify-between">
                <p className="text-sm text-foreground">{owner?.full_name ?? <span className="text-muted-foreground">Unassigned</span>}</p>
                {canEditInfo && <button type="button" onClick={() => setEditingOwner(true)} className="text-xs text-primary hover:underline">Edit</button>}
              </div>
            )}
          </div>

          {/* Next follow-up */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Next follow-up</p>
            {editingFollowUp ? (
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={followUpValue}
                  onChange={(e) => setFollowUpValue(e.target.value)}
                  autoFocus
                  className="h-8 border-border bg-muted text-sm text-foreground"
                />
                <Button variant="ghost" size="icon-xs" onClick={saveFollowUp} className="shrink-0 text-emerald-500 hover:text-emerald-400"><Check className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon-xs" onClick={() => setEditingFollowUp(false)} className="shrink-0 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="mt-0.5 flex items-center justify-between">
                <p className="text-sm text-foreground">
                  {client.next_follow_up_at
                    ? new Date(client.next_follow_up_at).toLocaleString()
                    : <span className="text-muted-foreground">Not set</span>}
                </p>
                {canEditInfo && (
                  <button
                    type="button"
                    onClick={() => {
                      setFollowUpValue(client.next_follow_up_at ? client.next_follow_up_at.slice(0, 16) : "");
                      setEditingFollowUp(true);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>

          {accountId && user && (
            <CustomFieldsSection
              accountId={accountId}
              currentUserId={user.id}
              entityType="client"
              entityId={client.id}
              isAdmin={canManageMembers}
              canEdit={canEditInfo}
            />
          )}
        </div>
      )}

      {/* ── Scope of Work ───────────────────────────────────────────── */}
      {tab === "scope" && accountId && user && (
        <div className="mt-4">
          <ScopeOfWorkSection
            accountId={accountId}
            currentUserId={user.id}
            clientId={client.id}
            items={scopeItems}
            isAdmin={canManageMembers}
            canEdit={canEditInfo}
            canCreate={canCreateScope}
            onChanged={load}
          />
        </div>
      )}
    </div>
  );
}
