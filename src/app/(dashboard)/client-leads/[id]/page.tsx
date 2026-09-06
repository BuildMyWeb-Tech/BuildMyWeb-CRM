"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Info,
  ListTodo,
  Loader2,
  MoreVertical,
  PauseCircle,
  Pencil,
  PlayCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileManager } from "@/components/files/file-manager";
import {
  LeadFormDialog,
  TaskChecklist,
  PRIORITY_STYLE,
  STATUS_STYLE,
  STATUS_LABEL,
  SOURCE_LABEL,
  whatsappLink,
  formatFollowUp,
  isOverdue,
} from "@/components/client-leads/lead-shared";
import type { AccountMember, ClientLead, LeadStatus } from "@/types";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

type DetailTab = "info" | "tasks" | "documents";

export default function ClientLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { accountId, user } = useAuth();
  const { canUpdate, canDelete } = usePagePermissions("client_leads");

  const [lead, setLead] = useState<ClientLead | null>(null);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [tab, setTab] = useState<DetailTab>("info");
  const [formOpen, setFormOpen] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function load() {
    const [leadRes, membersRes] = await Promise.all([
      fetch(`/api/client-leads/${params.id}`),
      fetch("/api/account/members"),
    ]);
    if (leadRes.status === 404) {
      setNotFound(true);
      return;
    }
    if (leadRes.ok) setLead((await leadRes.json()).lead ?? null);
    if (membersRes.ok) setMembers((await membersRes.json()).members ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleConfirm() {
    if (!lead) return;
    if (!window.confirm(`Confirm "${lead.title}" as a client? This moves it into Client Directory.`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}/confirm`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? "Could not confirm this lead.");
      return;
    }
    toast.success(`"${lead.title}" moved to Client Directory.`);
    router.push("/client-leads");
  }

  async function handleReject() {
    if (!lead) return;
    if (!window.confirm(`Reject "${lead.title}"? This deletes the lead — this can't be undone.`)) return;
    const res = await fetch(`/api/client-leads/${lead.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not reject this lead.");
      return;
    }
    toast.success("Lead rejected and removed.");
    router.push("/client-leads");
  }

  async function handleToggleHold() {
    if (!lead) return;
    const nextStatus: LeadStatus = lead.status === "hold" ? "in_discussion" : "hold";
    const res = await fetch(`/api/client-leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      toast.error("Could not update status.");
      return;
    }
    load();
  }

  if (notFound) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-muted-foreground">This enquiry doesn&apos;t exist or was already removed.</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/client-leads")}>
          Back to Client Enquiry
        </Button>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allocated = members.find((m) => m.user_id === lead.allocated_user_id);
  const overdue = isOverdue(lead);
  const tasks = lead.tasks ?? [];
  const doneCount = tasks.filter((t) => t.is_done).length;

  return (
    <div>
      <Link href="/client-leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Client Enquiry
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{lead.title}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[lead.priority]}`}>
              {lead.priority}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[lead.status]}`}>
              {STATUS_LABEL[lead.status]}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate && (
              <DropdownMenuItem onClick={() => setFormOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
            )}
            {canUpdate && (
              <DropdownMenuItem onClick={handleToggleHold}>
                {lead.status === "hold" ? (
                  <>
                    <PlayCircle className="h-3.5 w-3.5" />
                    Resume (back to In Discussion)
                  </>
                ) : (
                  <>
                    <PauseCircle className="h-3.5 w-3.5" />
                    Put on hold
                  </>
                )}
              </DropdownMenuItem>
            )}
            {canUpdate && (
              <DropdownMenuItem onClick={handleConfirm} className="text-emerald-500 focus:text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirm → Client Directory
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem onClick={handleReject} className="text-red-400 focus:text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                Reject (delete)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-center gap-1 border-b border-border">
        <DetailTabButton active={tab === "info"} onClick={() => setTab("info")} icon={Info} label="Info" />
        <DetailTabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={ListTodo} label={`Tasks (${doneCount}/${tasks.length})`} />
        <DetailTabButton active={tab === "documents"} onClick={() => setTab("documents")} icon={FolderOpen} label="Documents" />
      </div>

      {tab === "info" && (
        <div className="mt-6 grid max-w-2xl gap-5">
          <InfoRow label="Title" value={lead.title} />
          <InfoRow
            label="Phone No"
            value={
              lead.phone ? (
                <div className="flex items-center gap-1.5">
                  <span>{lead.phone}</span>
                  <a
                    href={whatsappLink(lead.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open in WhatsApp"
                    className="flex h-5 w-5 items-center justify-center rounded text-emerald-500 hover:bg-emerald-500/10"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              ) : (
                "—"
              )
            }
          />
          <InfoRow label="Priority" value={<span className="capitalize">{lead.priority}</span>} />
          <InfoRow label="Status" value={STATUS_LABEL[lead.status]} />
          <InfoRow label="Source" value={lead.source ? SOURCE_LABEL[lead.source] : "Not set"} />
          <InfoRow
            label="Next follow-up"
            value={
              <span className={`flex items-center gap-1 ${overdue ? "font-semibold text-red-400" : ""}`}>
                {overdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                {formatFollowUp(lead.next_follow_up_at)}
              </span>
            }
          />
          <InfoRow label="Allocated to" value={allocated?.full_name || "Unassigned"} />
          <InfoRow label="Notes" value={lead.notes || "—"} multiline />
        </div>
      )}

      {tab === "tasks" && (
        <div className="mt-6 max-w-2xl rounded-lg border border-border p-4">
          <TaskChecklist leadId={lead.id} tasks={tasks} canEdit={canUpdate} onChanged={load} />
        </div>
      )}

      {tab === "documents" && accountId && user?.id && (
        <div className="mt-6">
          <FileManager accountId={accountId} userId={user.id} projectId={null} leadId={lead.id} />
        </div>
      )}

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} initial={lead} members={members} onSaved={load} />
    </div>
  );
}

function DetailTabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Info;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function InfoRow({ label, value, multiline = false }: { label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-border pb-3">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-sm text-foreground ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</span>
    </div>
  );
}
