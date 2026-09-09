"use client";

import { useEffect, useState } from "react";
import { Rows3, ListTodo, UserPlus as UserPlusIcon, KanbanSquare, Package, FolderKanban } from "lucide-react";
import { UnifiedTasksView } from "@/components/daily-tasks/unified-tasks-view";
import { KanbanBoardView } from "@/components/kanban/kanban-board-view";
import { ProductsView } from "@/components/products/products-view";
import { EnquiryTasksView } from "@/components/client-leads/enquiry-tasks-view";
import { ProjectStatusGroups } from "@/components/overview/project-status-groups";
import type { Project } from "@/types";

type OverviewTab = "project" | "enquiry" | "products" | "kanban";

// Overview — the landing hub next to Dashboard: every task worth
// tracking (Project Tasks, Enquiry Tasks, Products, Kanban — all
// reused verbatim from their own pages, not lookalikes) plus a fixed
// side panel of the project roster grouped by status, always visible
// regardless of which tab is open.
export default function OverviewPage() {
  const [tab, setTab] = useState<OverviewTab>("project");
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setProjects(d.projects ?? []);
      });
  }, []);

  const TABS: { key: OverviewTab; label: string; icon: typeof ListTodo }[] = [
    { key: "project", label: "Project Tasks", icon: ListTodo },
    { key: "enquiry", label: "Enquiry Tasks", icon: UserPlusIcon },
    { key: "products", label: "Products", icon: Package },
    { key: "kanban", label: "Kanban", icon: KanbanSquare },
  ];

  return (
    <div>
      <div className="flex items-center gap-2">
        <Rows3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every task worth tracking, every product, and the board — with the project roster always in view.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="flex items-center gap-1 border-b border-border">
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
            {tab === "enquiry" && <EnquiryTasksView />}
            {tab === "products" && <ProductsView />}
            {tab === "kanban" && <KanbanBoardView />}
          </div>
        </div>

        {/* Fixed side panel — the project roster, always visible
            regardless of which tab is open (this is what shipped
            first; the "Projects" tab from the previous pass is gone,
            replaced by Products above). */}
        <div className="shrink-0">
          <div className="flex items-center gap-1.5">
            <FolderKanban className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Projects</h2>
          </div>
          <div className="mt-3">
            <ProjectStatusGroups projects={projects ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
