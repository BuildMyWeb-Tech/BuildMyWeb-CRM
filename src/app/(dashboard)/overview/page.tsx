"use client";

import { useEffect, useState, useCallback } from "react";
import { Folder, LayoutGrid, Search, Package, Kanban, ClipboardList, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { UnifiedTasksView } from "@/components/daily-tasks/unified-tasks-view";
import Link from "next/link";
import type { Project } from "@/types";

const PROJECT_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-teal-500", "bg-orange-500",
  "bg-pink-500", "bg-green-500", "bg-yellow-500", "bg-red-500",
];

function getProjectColor(index: number) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

interface ProjectWithTaskCount extends Project {
  task_count?: number;
}

type TabKey = "project-tasks" | "enquiry-tasks" | "products" | "kanban";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "project-tasks", label: "Project Tasks", icon: "📋" },
  { key: "enquiry-tasks", label: "Enquiry Tasks", icon: "📋" },
  { key: "products", label: "Products", icon: "🎁" },
  { key: "kanban", label: "Kanban", icon: "🔲" },
];

export default function OverviewPage() {
  const { accountId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("project-tasks");
  const [projects, setProjects] = useState<ProjectWithTaskCount[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  const loadProjects = useCallback(async () => {
    if (!accountId) return;
    setLoadingProjects(true);
    try {
      const supabase = createClient();
      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .eq("account_id", accountId)
        .order("name");

      if (!projectsData) { setLoadingProjects(false); return; }

      const { data: taskCounts } = await supabase
        .from("project_tasks")
        .select("project_id")
        .eq("account_id", accountId);

      const countMap: Record<string, number> = {};
      for (const t of taskCounts ?? []) {
        countMap[t.project_id] = (countMap[t.project_id] ?? 0) + 1;
      }

      setProjects(projectsData.map((p) => ({ ...p, task_count: countMap[p.id] ?? 0 })));
    } finally {
      setLoadingProjects(false);
    }
  }, [accountId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const activeProjects = projects.filter((p) => p.status === "active");
  const inactiveProjects = projects.filter((p) => p.status === "inactive");
  const archivedProjects = projects.filter((p) => p.status === "archived");

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0f1117]">
      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4">
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every task worth tracking, every product, and the board — with the project roster always in view.
          </p>
        </div>

        {/* Tabs */}
        <div className="shrink-0 border-b border-[#2a3045] px-6">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "border border-b-0 border-[#2a3045] bg-[#1a1f2e] text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === "project-tasks" && <UnifiedTasksView />}

          {activeTab === "enquiry-tasks" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="rounded-full bg-[#1a1f2e] p-6">
                <ClipboardList className="h-10 w-10 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Enquiry Tasks</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Manage and track all enquiry-related tasks in the client leads section.
                </p>
              </div>
              <Link
                href="/client-leads"
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Go to Client Leads
              </Link>
            </div>
          )}

          {activeTab === "products" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="rounded-full bg-[#1a1f2e] p-6">
                <Package className="h-10 w-10 text-teal-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Products</h2>
                <p className="mt-1 text-sm text-slate-400">
                  View and manage your product catalog.
                </p>
              </div>
              <Link
                href="/products"
                className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Go to Products
              </Link>
            </div>
          )}

          {activeTab === "kanban" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="rounded-full bg-[#1a1f2e] p-6">
                <Kanban className="h-10 w-10 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Kanban Board</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Drag and drop tasks between stages on the full Kanban board.
                </p>
              </div>
              <Link
                href="/kanban"
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Open Kanban Board
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="w-72 shrink-0 border-l border-[#2a3045] bg-[#1a1f2e] flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 pt-5 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <Folder className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Projects</h2>
          </div>

          {/* Counts */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 rounded-lg bg-[#0f1117] px-3 py-2 text-center">
              <p className="text-lg font-bold text-blue-400">{activeProjects.length}</p>
              <p className="text-[10px] text-slate-500">Active</p>
            </div>
            <div className="flex-1 rounded-lg bg-[#0f1117] px-3 py-2 text-center">
              <p className="text-lg font-bold text-slate-400">{inactiveProjects.length}</p>
              <p className="text-[10px] text-slate-500">Inactive</p>
            </div>
            <div className="flex-1 rounded-lg bg-[#0f1117] px-3 py-2 text-center">
              <p className="text-lg font-bold text-slate-500">{archivedProjects.length}</p>
              <p className="text-[10px] text-slate-500">Archived</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search projects..."
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              className="w-full rounded-lg bg-[#0f1117] border border-[#2a3045] pl-8 pr-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Project list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loadingProjects ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <p className="text-center text-xs text-slate-600 py-6">
              {projectSearch ? "No projects match your search" : "No projects yet"}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredProjects.map((project, idx) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-[#0f1117] transition-colors group"
                >
                  <span className={`h-6 w-6 shrink-0 rounded ${getProjectColor(idx)} flex items-center justify-center text-[10px] font-bold text-white`}>
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate text-xs text-slate-300 group-hover:text-white">
                    {project.name}
                  </span>
                  {(project.task_count ?? 0) > 0 && (
                    <span className="shrink-0 text-[10px] font-medium text-slate-500">
                      {project.task_count}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
