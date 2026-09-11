"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Folder, Search, Package, Kanban, ClipboardList,
  ExternalLink, ListChecks, MessageSquare,
} from "lucide-react";
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

interface ClientLead {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  next_follow_up_at: string | null;
  created_at: string;
}

interface ProjectChatMessage {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string;
  project_id: string;
  project?: { id: string; name: string } | null;
  sender?: { full_name: string | null } | null;
}

type TabKey = "project-tasks" | "enquiry-tasks" | "products" | "kanban" | "project-chats";

const TABS: { key: TabKey; label: string; icon: typeof ListChecks }[] = [
  { key: "project-tasks", label: "Project Tasks", icon: ListChecks },
  { key: "enquiry-tasks", label: "Enquiry Tasks", icon: ClipboardList },
  { key: "products", label: "Products", icon: Package },
  { key: "kanban", label: "Kanban", icon: Kanban },
  { key: "project-chats", label: "Project Chats", icon: MessageSquare },
];

const ENQUIRY_STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-400",
  in_discussion: "bg-teal-500/20 text-teal-400",
  hold: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-slate-500/20 text-slate-400",
};

export default function OverviewPage() {
  const { accountId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("project-tasks");
  const [projects, setProjects] = useState<ProjectWithTaskCount[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [enquiries, setEnquiries] = useState<ClientLead[]>([]);
  const [enquirySearch, setEnquirySearch] = useState("");
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState<string>("all");
  const [loadingEnquiries, setLoadingEnquiries] = useState(false);

  const [chatMessages, setChatMessages] = useState<ProjectChatMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);

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

  const loadEnquiries = useCallback(async () => {
    if (!accountId) return;
    setLoadingEnquiries(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("client_leads")
        .select("id, title, status, priority, next_follow_up_at, created_at")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      setEnquiries((data as ClientLead[]) ?? []);
    } finally {
      setLoadingEnquiries(false);
    }
  }, [accountId]);

  const loadChats = useCallback(async () => {
    if (!accountId) return;
    setLoadingChats(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("project_chat_messages")
        .select("id, body, created_at, sender_user_id, project_id, project:projects(id,name), sender:profiles(full_name)")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(50);
      setChatMessages((data as unknown as ProjectChatMessage[]) ?? []);
    } finally {
      setLoadingChats(false);
    }
  }, [accountId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => {
    if (activeTab === "enquiry-tasks") loadEnquiries();
    if (activeTab === "project-chats") loadChats();
  }, [activeTab, loadEnquiries, loadChats]);

  const activeProjects = projects.filter((p) => p.status === "active");
  const inactiveProjects = projects.filter((p) => p.status === "inactive");
  const archivedProjects = projects.filter((p) => p.status === "archived");

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const filteredEnquiries = enquiries.filter((e) => {
    const matchSearch = !enquirySearch || e.title.toLowerCase().includes(enquirySearch.toLowerCase());
    const matchStatus = enquiryStatusFilter === "all" || e.status === enquiryStatusFilter;
    return matchSearch && matchStatus;
  });

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

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
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
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
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === "project-tasks" && <UnifiedTasksView />}

          {activeTab === "enquiry-tasks" && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search enquiries..."
                  value={enquirySearch}
                  onChange={(e) => setEnquirySearch(e.target.value)}
                  className="flex-1 min-w-[180px] max-w-xs rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
                />
                <select
                  value={enquiryStatusFilter}
                  onChange={(e) => setEnquiryStatusFilter(e.target.value)}
                  className="rounded-lg border border-[#2a3045] bg-[#1a1f2e] px-3 py-1.5 text-sm text-slate-300 focus:border-blue-500 focus:outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="new">New</option>
                  <option value="in_discussion">In Discussion</option>
                  <option value="hold">Hold</option>
                  <option value="confirmed">Converted</option>
                  <option value="rejected">Rejected</option>
                </select>
                <Link
                  href="/client-leads"
                  className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600/20 px-3 py-1.5 text-sm font-medium text-blue-400 hover:bg-blue-600/30 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open Client Leads
                </Link>
              </div>

              {loadingEnquiries ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : filteredEnquiries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-16 text-center gap-3">
                  <ClipboardList className="h-10 w-10 text-slate-600" />
                  <p className="text-sm text-slate-500">
                    {enquirySearch || enquiryStatusFilter !== "all" ? "No enquiries match this filter." : "No enquiries yet."}
                  </p>
                  <Link href="/client-leads" className="text-xs text-blue-400 hover:underline">Go to Client Leads →</Link>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#2a3045]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3045] text-left text-[11px] uppercase tracking-wider text-slate-500 bg-[#1a1f2e]">
                        <th className="px-4 py-2.5 font-medium">Title</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 font-medium">Priority</th>
                        <th className="px-4 py-2.5 font-medium">Next Follow-up</th>
                        <th className="px-4 py-2.5 font-medium">Created</th>
                        <th className="px-4 py-2.5 font-medium w-0" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEnquiries.map((e) => (
                        <tr key={e.id} className="border-b border-[#2a3045] last:border-0 hover:bg-[#1a1f2e] transition-colors">
                          <td className="px-4 py-3 font-medium text-white">
                            <Link href={`/client-leads/${e.id}`} className="hover:text-blue-400 transition-colors">
                              {e.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${ENQUIRY_STATUS_STYLE[e.status] ?? "bg-slate-500/20 text-slate-400"}`}>
                              {e.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {e.priority ? (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_STYLE[e.priority] ?? "bg-slate-500/20 text-slate-400"}`}>
                                {e.priority}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {e.next_follow_up_at
                              ? new Date(e.next_follow_up_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{timeAgo(e.created_at)}</td>
                          <td className="px-4 py-3">
                            <Link href={`/client-leads/${e.id}`} className="text-slate-500 hover:text-blue-400 transition-colors">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "products" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="rounded-full bg-[#1a1f2e] p-6">
                <Package className="h-10 w-10 text-teal-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Products</h2>
                <p className="mt-1 text-sm text-slate-400">View and manage your product catalog.</p>
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
                <p className="mt-1 text-sm text-slate-400">Drag and drop tasks between stages on the full Kanban board.</p>
              </div>
              <Link
                href="/kanban"
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Open Kanban Board
              </Link>
            </div>
          )}

          {activeTab === "project-chats" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">Recent messages across all project chats</p>
                <Link href="/projects" className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  View all projects <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              {loadingChats ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a3045] py-16 text-center gap-3">
                  <MessageSquare className="h-10 w-10 text-slate-600" />
                  <p className="text-sm text-slate-500">No project chat messages yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3 rounded-xl border border-[#2a3045] bg-[#1a1f2e] px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                        {(msg.sender?.full_name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-white">{msg.sender?.full_name ?? "Unknown"}</span>
                          {msg.project && (
                            <Link
                              href={`/projects/${msg.project_id}`}
                              className="text-[11px] text-blue-400 hover:underline"
                            >
                              #{msg.project.name}
                            </Link>
                          )}
                          <span className="ml-auto text-[11px] text-slate-500">{timeAgo(msg.created_at)}</span>
                        </div>
                        <p className="text-sm text-slate-300 line-clamp-2">{msg.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
