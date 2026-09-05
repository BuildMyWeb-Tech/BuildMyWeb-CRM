"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, FileText, Folder, Briefcase, Upload, ImageIcon, Check, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CombinedFilesView } from "@/components/files/combined-files-view";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { ScopeOfWorkSection } from "@/components/clients/scope-of-work-section";
import { useAuth } from "@/hooks/use-auth";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { createClient } from "@/lib/supabase/client";
import type { Client, ClientStatus, ScopeOfWork } from "@/types";
import { toast } from "sonner";

type ClientTab = "info" | "scope" | "files";
const STATUSES: ClientStatus[] = ["active", "inactive", "archived"];
const ACCENT_COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
];

// Info fields other than name/status use this generic row so
// editing one doesn't touch any of the others — same read-only-
// with-a-click-to-edit pattern as Company Info, applied per-client
// instead of per-account. Each field saves independently on its own
// PATCH call rather than one big form with a single global Save.
type InfoField = "name" | "interface_name" | "interface_contact_number" | "client_since" | "notes";

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const { accountId, user, canManageMembers, canUpdateRecords, canSendMessages } = useAuth();
  const { canUpdate: gridCanUpdate, canCreate: gridCanCreate } = usePagePermissions("client_directory");
  // The grid only ever narrows the existing role-based capability,
  // never widens it — both must allow an action for it to actually
  // show, matching requirePagePermission()'s server-side semantics.
  const canEditInfo = canUpdateRecords && gridCanUpdate;
  const canCreateScope = canSendMessages && gridCanCreate;
  const [tab, setTab] = useState<ClientTab>("info");

  const [client, setClient] = useState<Client | null>(null);
  const [scopeItems, setScopeItems] = useState<ScopeOfWork[]>([]);
  const [loading, setLoading] = useState(true);

  const [accentColor, setAccentColor] = useState<string>(ACCENT_COLORS[0]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [editingField, setEditingField] = useState<InfoField | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingField, setSavingField] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/clients/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (!data) return;
        setClient(data.client);
        setScopeItems(data.scopeOfWork ?? []);
        setAccentColor(data.client.accent_color ?? ACCENT_COLORS[0]);

        if (data.client.logo_storage_path) {
          const supabase = createClient();
          const { data: signed } = await supabase.storage
            .from("files")
            .createSignedUrl(data.client.logo_storage_path, 3600);
          setLogoUrl(signed?.signedUrl ?? null);
        } else {
          setLogoUrl(null);
        }
      })
      .catch((err) => console.error("[client-detail] load failed:", err))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function fieldValue(field: InfoField): string {
    if (!client) return "";
    switch (field) {
      case "name": return client.name;
      case "interface_name": return client.interface_name ?? "";
      case "interface_contact_number": return client.interface_contact_number ?? "";
      case "client_since": return client.client_since ?? "";
      case "notes": return client.notes ?? "";
    }
  }

  function startFieldEdit(field: InfoField) {
    setEditingField(field);
    setEditingValue(fieldValue(field));
  }

  function cancelFieldEdit() {
    setEditingField(null);
    setEditingValue("");
  }

  async function saveFieldEdit(field: InfoField) {
    if (!client) return;
    if (field === "name" && !editingValue.trim()) {
      toast.error("Name can't be empty.");
      return;
    }
    setSavingField(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: editingValue.trim() || null }),
      });
      if (!res.ok) {
        toast.error("Could not save.");
        return;
      }
      setClient({ ...client, [field]: editingValue.trim() || null } as Client);
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
      if (!res.ok) {
        toast.error("Could not save.");
        return;
      }
      setClient({ ...client, status: next });
      setEditingStatus(false);
      toast.success("Status updated.");
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveAccentColor(color: string) {
    if (!client) return;
    setAccentColor(color);
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accent_color: color }),
    });
    if (!res.ok) {
      toast.error("Could not save accent color.");
      return;
    }
    setClient({ ...client, accent_color: color });
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !client || !accountId) return;

    setUploadingLogo(true);
    try {
      const supabase = createClient();
      const path = `${accountId}/client-logos/${client.id}-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("files").upload(path, file, {
        upsert: true,
      });
      if (uploadError) {
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }

      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_storage_path: path }),
      });
      if (!res.ok) {
        toast.error("Logo uploaded but could not be saved.");
        return;
      }

      const { data: signed } = await supabase.storage.from("files").createSignedUrl(path, 3600);
      setLogoUrl(signed?.signedUrl ?? null);
      toast.success("Logo updated.");
    } finally {
      setUploadingLogo(false);
    }
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

  const FIELD_LABELS: Record<InfoField, string> = {
    name: "Name",
    interface_name: "Client interface name",
    interface_contact_number: "Interface contact number",
    client_since: "Client since",
    notes: "Notes",
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <Link href="/clients" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{client.name}</h1>
      </div>

      <div className="mt-4 flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "info"} onClick={() => setTab("info")} icon={FileText}>Info</TabButton>
        <TabButton active={tab === "scope"} onClick={() => setTab("scope")} icon={Briefcase}>Scope of Work</TabButton>
        <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={Folder}>Files</TabButton>
      </div>

      {tab === "info" && (
        <div className="mt-4 flex max-w-lg flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset next/image can optimize
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
                  aria-label={`Pick color ${color}`}
                />
              ))}
            </div>
          </div>

          {(Object.keys(FIELD_LABELS) as InfoField[]).map((field) => (
            <div key={field} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{FIELD_LABELS[field]}</p>
                {editingField === field ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      type={field === "client_since" ? "date" : "text"}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      autoFocus
                      className="h-8 border-border bg-muted text-sm text-foreground"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveFieldEdit(field);
                        if (e.key === "Escape") cancelFieldEdit();
                      }}
                    />
                    <Button variant="ghost" size="icon-xs" onClick={() => saveFieldEdit(field)} disabled={savingField} className="shrink-0 text-emerald-500 hover:text-emerald-400">
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={cancelFieldEdit} disabled={savingField} className="shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="mt-0.5 text-sm text-foreground">
                    {fieldValue(field).trim()
                      ? field === "client_since"
                        ? new Date(fieldValue(field)).toLocaleDateString()
                        : fieldValue(field)
                      : <span className="text-muted-foreground">Not set</span>}
                  </p>
                )}
              </div>
              {canEditInfo && editingField !== field && (
                <button
                  type="button"
                  onClick={() => startFieldEdit(field)}
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
          ))}

          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            {editingStatus ? (
              <div className="mt-1 flex items-center gap-2">
                <Select value={client.status} onValueChange={(v) => v && saveStatus(v as ClientStatus)} disabled={savingStatus}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon-xs" onClick={() => setEditingStatus(false)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="mt-0.5 flex items-center justify-between">
                <p className="text-sm capitalize text-foreground">{client.status}</p>
                {canEditInfo && (
                  <button type="button" onClick={() => setEditingStatus(true)} className="text-xs text-primary hover:underline">
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

      {tab === "files" && accountId && user && (
        <div className="mt-4">
          <CombinedFilesView accountId={accountId} userId={user.id} clientId={client.id} />
        </div>
      )}
    </div>
  );
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
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
