"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, FileText, Folder, Briefcase } from "lucide-react";
import Link from "next/link";
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
import { FileManager } from "@/components/files/file-manager";
import { CustomFieldsSection } from "@/components/custom-fields/custom-fields-section";
import { ScopeOfWorkSection } from "@/components/clients/scope-of-work-section";
import { useAuth } from "@/hooks/use-auth";
import type { Client, ClientStatus, ScopeOfWork } from "@/types";
import { toast } from "sonner";

type ClientTab = "info" | "scope" | "files";
const STATUSES: ClientStatus[] = ["active", "inactive", "archived"];

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const { accountId, user, canManageMembers, canUpdateRecords, canSendMessages } = useAuth();
  const [tab, setTab] = useState<ClientTab>("info");

  const [client, setClient] = useState<Client | null>(null);
  const [scopeItems, setScopeItems] = useState<ScopeOfWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [interfaceName, setInterfaceName] = useState("");
  const [interfaceNumber, setInterfaceNumber] = useState("");
  const [clientSince, setClientSince] = useState("");
  const [status, setStatus] = useState<ClientStatus>("active");
  const [notes, setNotes] = useState("");

  const load = useCallback(() => {
    fetch(`/api/clients/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setClient(data.client);
        setScopeItems(data.scopeOfWork ?? []);
        setName(data.client.name);
        setInterfaceName(data.client.interface_name ?? "");
        setInterfaceNumber(data.client.interface_contact_number ?? "");
        setClientSince(data.client.client_since ?? "");
        setStatus(data.client.status);
        setNotes(data.client.notes ?? "");
      })
      .catch((err) => console.error("[client-detail] load failed:", err))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          interface_name: interfaceName.trim() || null,
          interface_contact_number: interfaceNumber.trim() || null,
          client_since: clientSince || null,
          status,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        toast.error("Could not save.");
        return;
      }
      toast.success("Client updated.");
      load();
    } finally {
      setSaving(false);
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
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canUpdateRecords} className="border-border bg-muted text-foreground disabled:opacity-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Client interface name</Label>
              <Input value={interfaceName} onChange={(e) => setInterfaceName(e.target.value)} disabled={!canUpdateRecords} className="border-border bg-muted text-foreground disabled:opacity-100" />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Interface contact number</Label>
              <Input value={interfaceNumber} onChange={(e) => setInterfaceNumber(e.target.value)} disabled={!canUpdateRecords} className="border-border bg-muted text-foreground disabled:opacity-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Client since</Label>
              <Input type="date" value={clientSince} onChange={(e) => setClientSince(e.target.value)} disabled={!canUpdateRecords} className="border-border bg-muted text-foreground disabled:opacity-100" />
            </div>
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as ClientStatus)} disabled={!canUpdateRecords}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canUpdateRecords} className="border-border bg-muted text-foreground disabled:opacity-100" rows={3} />
          </div>

          {accountId && user && (
            <CustomFieldsSection
              accountId={accountId}
              currentUserId={user.id}
              entityType="client"
              entityId={client.id}
              isAdmin={canManageMembers}
              canEdit={canUpdateRecords}
            />
          )}

          {canUpdateRecords && (
            <Button onClick={handleSave} disabled={saving} className="w-fit">
              {saving ? "Saving…" : "Save changes"}
            </Button>
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
            canEdit={canUpdateRecords}
            canCreate={canSendMessages}
            onChanged={load}
          />
        </div>
      )}

      {tab === "files" && accountId && user && (
        <div className="mt-4">
          <FileManager accountId={accountId} userId={user.id} projectId={null} clientId={client.id} />
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
