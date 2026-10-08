"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ListTodo, CheckSquare, Clock, AlertTriangle, AlertCircle,
  Folder, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { UnifiedTasksView } from "@/components/daily-tasks/unified-tasks-view";
import Link from "next/link";
import type { Project } from "@/types";

interface TaskStats {
  total: number;
  inProgress: number;
  pending: number;
  overdue: number;
}

interface ProjectWithTaskCount extends Project {
  task_count: number;
}


const PROJECT_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-teal-500", "bg-orange-500",
  "bg-pink-500", "bg-green-500", "bg-yellow-500", "bg-red-500",
];

function getProjectColor(index: number) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

type ViewMode = "current" | "scheduled" | "all";

const VIEW_TABS: { id: ViewMode; label: string }[] = [
  { id: "current", label: "Current Tasks" },
  { id: "scheduled", label: "Scheduled" },
  { id: "all", label: "All Tasks" },
];

export default function DailyTasksPage() {
  const { accountId } = useAuth();
  const [stats, setStats] = useState<TaskStats>({ total: 0, inProgress: 0, pending: 0, overdue: 0 });
  const [projects, setProjects] = useState<ProjectWithTaskCount[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("current");

  const loadData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const today = new Date().toISOString().split("T")[0];

      const { data: tasks } = await supabase
        .from("project_tasks")
        .select("id, project_id, stage_id, due_date, pipeline_stages(name)")
        .eq("account_id", accountId);

      if (!tasks) return;

      let inProgress = 0, pending = 0, overdue = 0;
      const projectCountMap: Record<string, number> = {};
      const stageCountMap: Record<string, number> = {};

      for (const t of tasks) {
        const stageName = (t.pipeline_stages as { name?: string } | null)?.name?.toLowerCase() ?? "";
        if (stageName.includes("progress") || stageName.includes("doing")) inProgress++;
        else if (stageName.includes("pending") || stageName.includes("todo") || stageName.includes("to do")) pending++;
        if (t.due_date && t.due_date < today) overdue++;
        projectCountMap[t.project_id] = (projectCountMap[t.project_id] ?? 0) + 1;
        const key = (t.pipeline_stages as { name?: string } | null)?.name ?? "Unknown";
        stageCountMap[key] = (stageCountMap[key] ?? 0) + 1;
      }

      setStats({ total: tasks.length, inProgress, pending, overdue });

      const { data: projectsData } = await supabase
  .from("projects")
  .select("*")
  .eq("account_id", accountId)
  .order("name");

      if (projectsData) {
        setProjects(projectsData.map((p) => ({ ...p, task_count: projectCountMap[p.id] ?? 0 })));
      }

      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, name, status")
        .eq("account_id", accountId)
        .order("name");
      if (clientsData) setClients(clientsData as { id: string; name: string; status: string }[]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { loadData(); }, [loadData]);

  const statCards = [
    {
      label: "Total Tasks",
      value: stats.total,
      sub: "Across all projects",
      icon: CheckSquare,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      sub: "Currently being worked on",
      icon: Clock,
      color: "text-teal-400",
      bg: "bg-teal-500/10",
      border: "border-teal-500/20",
    },
    {
      label: "Pending",
      value: stats.pending,
      sub: "Waiting for action",
      icon: AlertTriangle,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
    },
    {
      label: "Overdue",
      value: stats.overdue,
      sub: "Needs immediate attention",
      icon: AlertCircle,
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    },
  ];

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] overflow-hidden bg-[#0f1117]">
      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <ListTodo className="h-5 w-5 text-blue-400" />
            </div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Project Tasks</h1>
          </div>
        </div>

        {/* Stat cards */}
        <div className="shrink-0 grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4 sm:px-6">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`rounded-xl border ${card.border} ${card.bg} p-4 flex items-start justify-between`}
              >
                <div>
                  <p className="text-xs text-slate-400 mb-1">{card.label}</p>
                  <p className="text-2xl font-bold text-white">
                    {loading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-white/10" /> : card.value}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">{card.sub}</p>
                </div>
                <div className={`rounded-lg p-2 ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* View mode tabs */}
        <div className="shrink-0 px-4 pb-3 sm:px-6">
          <div className="flex items-center gap-1 rounded-lg bg-[#1a1f2e] p-1 w-fit">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === tab.id
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tasks table */}
        <div className="flex-1 overflow-auto px-4 pb-6 sm:px-6">
          <UnifiedTasksView viewMode={viewMode} />
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="hidden lg:flex w-72 shrink-0 border-l border-[#2a3045] bg-[#1a1f2e] flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          

         
          {/* Projects section */}
<div>
  <div className="flex items-center gap-2 mb-3">
    <Folder className="h-4 w-4 text-blue-400" />
    <h2 className="text-sm font-semibold text-white">Projects</h2>
  </div>

  <div className="space-y-2">
    {loading ? (
      <div className="flex items-center justify-center py-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    ) : projects.length === 0 ? (
      <p className="text-xs text-slate-600 text-center py-3">
        No projects
      </p>
    ) : (
      (["active", "inactive", "completed", "archived"] as const).map(
        (status) => {
          const group = projects.filter(
            (project) => project.status === status
          );

          if (group.length === 0) return null;

          const isActive = status === "active";

          return (
            <details
              key={status}
              open={isActive}
              className="group/status"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-1 py-1.5 hover:bg-[#0f1117]">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      status === "active"
                        ? "bg-green-400"
                        : status === "inactive"
                        ? "bg-yellow-400"
                        : status === "completed"
                        ? "bg-blue-400"
                        : "bg-slate-500"
                    }`}
                  />

                  <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 capitalize">
                    {status}
                  </span>

                  <span className="text-[9px] font-medium text-slate-600">
                    {group.length}
                  </span>
                </div>

                <span className="text-[10px] text-slate-600 transition-transform group-open/status:rotate-180">
                  ▼
                </span>
              </summary>

              <div className="mt-1 space-y-1">
                {group.map((project, idx) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[#0f1117] transition-colors group"
                  >
                    <span
                      className={`h-5 w-5 shrink-0 rounded ${getProjectColor(
                        idx
                      )} flex items-center justify-center text-[9px] font-bold text-white`}
                    >
                      {project.name.charAt(0).toUpperCase()}
                    </span>

                    <span className="flex-1 truncate text-xs text-slate-300 group-hover:text-white">
                      {project.name}
                    </span>

                    {/* Task count */}
                    <span className="shrink-0 rounded-md bg-[#252b3d] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                      {project.task_count}
                    </span>
                  </Link>
                ))}
              </div>
            </details>
          );
        }
      )
    )}
  </div>
</div>

        </div>
      </div>
    </div>
  );
}
