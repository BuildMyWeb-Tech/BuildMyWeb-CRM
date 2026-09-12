"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ListTodo, CheckSquare, Clock, AlertTriangle, AlertCircle,
  Folder,
} from "lucide-react";
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

export default function DailyTasksPage() {
  const { accountId } = useAuth();
  const [stats, setStats] = useState<TaskStats>({ total: 0, inProgress: 0, pending: 0, overdue: 0 });
  const [projects, setProjects] = useState<ProjectWithTaskCount[]>([]);
  const [loading, setLoading] = useState(true);

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
        .eq("status", "active")
        .order("name");

      if (projectsData) {
        setProjects(projectsData.map((p) => ({ ...p, task_count: projectCountMap[p.id] ?? 0 })));
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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0f1117]">
      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <ListTodo className="h-5 w-5 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Project Tasks</h1>
          </div>
          <p className="text-sm text-slate-400 ml-11">
            Track and manage all project tasks, stay on top of deadlines and keep your team aligned.
          </p>
        </div>

        {/* Stat cards */}
        <div className="shrink-0 grid grid-cols-4 gap-4 px-6 pb-4">
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

        {/* Tasks table */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <UnifiedTasksView />
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div className="w-72 shrink-0 border-l border-[#2a3045] bg-[#1a1f2e] flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Projects section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Folder className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Projects</h2>
            </div>
            <div className="space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : projects.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-3">No active projects</p>
              ) : (
                projects.map((project, idx) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[#0f1117] transition-colors group"
                  >
                    <span className={`h-5 w-5 shrink-0 rounded ${getProjectColor(idx)} flex items-center justify-center text-[9px] font-bold text-white`}>
                      {project.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate text-xs text-slate-300 group-hover:text-white">
                      {project.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-slate-500">
                      {project.task_count}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
