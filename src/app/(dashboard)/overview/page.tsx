"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rows3, ListTodo, UserPlus as UserPlusIcon, KanbanSquare, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedTasksView } from "@/components/daily-tasks/unified-tasks-view";
import { AllTasksTab, type TaskGroup } from "@/components/client-leads/lead-shared";
import { usePagePermissions } from "@/hooks/use-page-permissions";
import type { ClientLead, Project, ProjectStatus } from "@/types";

const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: "bg-primary/10 text-primary",
  inactive: "bg-amber-500/15 text-amber-500",
  archived: "bg-muted text-muted-foreground",
};

// Overview — the landing hub next to Dashboard: every task worth
// tracking (Project Tasks, Enquiry Tasks — same components/APIs as
// their own pages, reused verbatim) plus a running list of active
// projects, all in one place instead of hopping between pages to
// check status.
export default function OverviewPage() {
  const { canUpdate: canEditLeadTasks } = usePagePermissions("client_leads");
  const [tab, setTab] = useState<"project" | "enquiry">("project");
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

  const taskGroups: TaskGroup[] = (leads ?? [])
    .filter((l) => l.status !== "rejected" && (l.tasks ?? []).length > 0)
    .map((lead) => ({
      leadId: lead.id,
      leadTitle: lead.title,
      tasks: lead.tasks ?? [],
      leadPriority: lead.priority,
      leadStatus: lead.status,
    }));

  const activeProjects = (projects ?? []).filter((p) => p.status === "active");

  return (
    <div>
      <div className="flex items-center gap-2">
        <Rows3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every task worth tracking, and every active project, in one place.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="flex items-center gap-1 border-b border-border">
            <button
              type="button"
              onClick={() => setTab("project")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === "project" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListTodo className="h-3.5 w-3.5" />
              Project Tasks
            </button>
            <button
              type="button"
              onClick={() => setTab("enquiry")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === "enquiry" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlusIcon className="h-3.5 w-3.5" />
              Enquiry Tasks
            </button>
          </div>

          <div className="mt-4">
            {tab === "project" ? (
              <UnifiedTasksView />
            ) : (
              <AllTasksTab groups={taskGroups} canEdit={canEditLeadTasks} onChanged={loadLeads} />
            )}
          </div>
        </div>

        <div className="shrink-0">
          <div className="flex items-center gap-1.5">
            <KanbanSquare className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Active projects</h2>
          </div>
          {projects === null ? (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeProjects.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No active projects right now.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {activeProjects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <Card className="transition-colors hover:border-primary/40">
                    <CardHeader className="pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{p.name}</CardTitle>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLE[p.status]}`}>
                          {p.status}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-1.5">
                      <p className="truncate text-xs text-muted-foreground">
                        {p.client_name || "No client set"}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
