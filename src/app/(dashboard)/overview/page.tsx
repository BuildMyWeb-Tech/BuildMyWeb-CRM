"use client";

import { useEffect, useMemo, useState } from "react";
import { Rows3, ListTodo, UserPlus as UserPlusIcon, KanbanSquare, FolderKanban } from "lucide-react";
import { UnifiedTasksView } from "@/components/daily-tasks/unified-tasks-view";
import { KanbanBoardView } from "@/components/kanban/kanban-board-view";
import { AllTasksTab, type TaskGroup } from "@/components/client-leads/lead-shared";
import { ProjectStatusGroups } from "@/components/overview/project-status-groups";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import { useAccountMembers } from "@/hooks/use-account-members";
import type { ClientLead, LeadStatus, Project } from "@/types";
import { toast } from "sonner";

type OverviewTab = "project" | "enquiry" | "projects" | "kanban";

// Overview — the landing hub next to Dashboard: every task worth
// tracking (Project Tasks, Enquiry Tasks, Kanban — all reused
// verbatim from their own pages, not lookalikes) plus the full
// project roster grouped by status.
export default function OverviewPage() {
  const { canUpdate: canEditLeadTasks } = usePagePermissions("client_leads");
  const { members } = useAccountMembers();
  const [tab, setTab] = useState<OverviewTab>("project");
  const [leads, setLeads] = useState<ClientLead[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);

  async function loadLeads() {
    const res = await fetch("/api/client-leads");
    if (res.ok) setLeads((await res.json()).leads ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeads();
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setProjects(d.projects ?? []);
      });
  }, []);

  const membersById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const taskGroups: TaskGroup[] = (leads ?? [])
    .filter((l) => l.status !== "rejected" && (l.tasks ?? []).length > 0)
    .map((lead) => ({
      leadId: lead.id,
      leadTitle: lead.title,
      tasks: lead.tasks ?? [],
      leadPriority: lead.priority,
      leadStatus: lead.status,
      leadPhone: lead.phone,
      leadAllocatedName: lead.allocated_user_id ? membersById.get(lead.allocated_user_id)?.full_name : null,
    }));

  async function handleConfirmLead(leadId: string) {
    const lead = leads?.find((l) => l.id === leadId);
    if (!lead) return;
    if (!window.confirm(`Confirm "${lead.title}" as a client? This moves it into Client Directory.`)) return;
    const res = await fetch(`/api/client-leads/${leadId}/confirm`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error ?? "Could not confirm this lead.");
      return;
    }
    loadLeads();
    toast.success(`"${lead.title}" moved to Client Directory.`);
  }

  async function handleRejectLead(leadId: string) {
    const lead = leads?.find((l) => l.id === leadId);
    if (!lead) return;
    if (!window.confirm(`Reject "${lead.title}"? This deletes the lead — this can't be undone.`)) return;
    const res = await fetch(`/api/client-leads/${leadId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not reject this lead.");
      return;
    }
    loadLeads();
    toast.success("Lead rejected and removed.");
  }

  async function handleToggleHoldLead(leadId: string) {
    const lead = leads?.find((l) => l.id === leadId);
    if (!lead) return;
    const nextStatus: LeadStatus = lead.status === "hold" ? "in_discussion" : "hold";
    const res = await fetch(`/api/client-leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      toast.error("Could not update status.");
      return;
    }
    loadLeads();
  }

  const TABS: { key: OverviewTab; label: string; icon: typeof ListTodo }[] = [
    { key: "project", label: "Project Tasks", icon: ListTodo },
    { key: "enquiry", label: "Enquiry Tasks", icon: UserPlusIcon },
    { key: "projects", label: "Projects", icon: FolderKanban },
    { key: "kanban", label: "Kanban", icon: KanbanSquare },
  ];

  return (
    <div>
      <div className="flex items-center gap-2">
        <Rows3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every task worth tracking, every project, and the board — all in one place.
      </p>

      <div className="mt-6 flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "project" && <UnifiedTasksView />}
        {tab === "enquiry" && (
          <AllTasksTab
            groups={taskGroups}
            canEdit={canEditLeadTasks}
            onChanged={loadLeads}
            onConfirmLead={canEditLeadTasks ? handleConfirmLead : undefined}
            onRejectLead={canEditLeadTasks ? handleRejectLead : undefined}
            onToggleHoldLead={canEditLeadTasks ? handleToggleHoldLead : undefined}
          />
        )}
        {tab === "projects" && <ProjectStatusGroups projects={projects ?? []} />}
        {tab === "kanban" && <KanbanBoardView />}
      </div>
    </div>
  );
}
