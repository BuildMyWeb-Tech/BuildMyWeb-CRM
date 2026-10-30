"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ListTodo, CheckSquare, Clock, AlertTriangle, AlertCircle, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { UnifiedTasksView, ProjectsPanel } from "@/components/daily-tasks/unified-tasks-view";
import { toast } from "sonner";

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
  scheduled_task_count: number;
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
        .select("id, project_id, stage_id, due_date, show_date, pipeline_stages(name)")
        .eq("account_id", accountId);

      if (!tasks) return;

      let inProgress = 0, pending = 0, overdue = 0;
      const projectCountMap: Record<string, number> = {};
      const projectScheduledMap: Record<string, number> = {};
      const stageCountMap: Record<string, number> = {};

      for (const t of tasks) {
        const stageName = (t.pipeline_stages as { name?: string } | null)?.name?.toLowerCase() ?? "";
        if (stageName.includes("progress") || stageName.includes("doing")) inProgress++;
        else if (stageName.includes("pending") || stageName.includes("todo") || stageName.includes("to do")) pending++;
        if (t.due_date && t.due_date < today) overdue++;
        const isScheduled = !!(t.show_date && t.show_date > today);
        if (isScheduled) {
          projectScheduledMap[t.project_id] = (projectScheduledMap[t.project_id] ?? 0) + 1;
        } else {
          projectCountMap[t.project_id] = (projectCountMap[t.project_id] ?? 0) + 1;
        }
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
        setProjects(projectsData.map((p) => ({
          ...p,
          task_count: projectCountMap[p.id] ?? 0,
          scheduled_task_count: projectScheduledMap[p.id] ?? 0,
        })));
      }

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
          <div className="flex items-center justify-between gap-2.5 mb-1">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <ListTodo className="h-5 w-5 text-blue-400" />
              </div>
              <h1 className="text-xl font-bold text-white sm:text-2xl">Project Tasks</h1>
            </div>
            <Link href="/daily-tasks/recurring"
              className="flex items-center gap-1.5 rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-blue-500/40 transition-colors">
              <RotateCcw className="h-3.5 w-3.5" /> Recurring
            </Link>
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

          

         
          {/* Projects by Status — drag & drop */}
        <ProjectsPanel
          projects={projects}
          taskCounts={Object.fromEntries(projects.map((p) => [p.id, { current: p.task_count, scheduled: p.scheduled_task_count }]))}
          onStatusChange={async (projectId, newStatus) => {
            try {
              const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
              });
              if (res.ok) {
                loadData();
              } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data?.error ?? "Could not update project status.");
              }
            } catch {
              toast.error("Could not update project status.");
            }
          }}
        />

        </div>
      </div>
    </div>
  );
}
