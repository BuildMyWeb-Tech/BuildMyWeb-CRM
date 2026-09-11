"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot, Building2, Clock, Folder, GitBranch, IndianRupee,
  KanbanSquare, LayoutGrid, ListTodo, Megaphone, MessageSquare,
  Package, Phone, PenSquare, Radio, UserPlus, Users, Users2,
  Workflow, Zap, Sparkles, BarChart3, Layers
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions — each tab groups related CRM pages as quick-access tiles.
// ─────────────────────────────────────────────────────────────────────────────

interface Tile {
  href: string;
  label: string;
  description: string;
  icon: typeof Users;
  color: string;
}

interface Tab {
  id: string;
  label: string;
  tiles: Tile[];
}

const TABS: Tab[] = [
  {
    id: "work",
    label: "My Work",
    tiles: [
      { href: "/my-work", label: "My Work Dashboard", description: "Tasks, follow-ups, project health and recent activity", icon: BarChart3, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
      { href: "/daily-tasks", label: "Project Tasks", description: "All tasks across projects and personal to-dos", icon: ListTodo, color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
      { href: "/kanban", label: "Kanban Board", description: "Drag-and-drop task management board", icon: LayoutGrid, color: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
      { href: "/notifications", label: "Notifications", description: "Activity alerts and mentions", icon: MessageSquare, color: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    tiles: [
      { href: "/clients", label: "Client Directory", description: "All active clients and their details", icon: Users, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
      { href: "/client-leads", label: "Client Enquiries", description: "Leads and enquiry pipeline stages", icon: UserPlus, color: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
      { href: "/future-clients", label: "Future Clients", description: "Prospective clients and opportunities", icon: Sparkles, color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    tiles: [
      { href: "/projects", label: "Projects", description: "All active and past projects", icon: KanbanSquare, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
      { href: "/projects/chat", label: "Project Chats", description: "Team discussions per project", icon: MessageSquare, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
      { href: "/projects/automations", label: "Task Automation", description: "Automated rules for project tasks", icon: Zap, color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    tiles: [
      { href: "/inbox", label: "WhatsApp Inbox", description: "Conversations from all channels", icon: MessageSquare, color: "bg-green-500/10 text-green-600 dark:text-green-400" },
      { href: "/contacts", label: "Contacts", description: "All contacts and their history", icon: Users, color: "bg-lime-500/10 text-lime-600 dark:text-lime-400" },
      { href: "/pipelines", label: "Pipelines", description: "Deal stages and sales funnel", icon: GitBranch, color: "bg-green-500/10 text-green-600 dark:text-green-400" },
      { href: "/broadcasts", label: "Broadcasts", description: "WhatsApp broadcast campaigns", icon: Radio, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
      { href: "/automations", label: "Automations", description: "Sales and messaging automations", icon: Zap, color: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
      { href: "/flows", label: "Flows", description: "Conversation flows and chatbots", icon: Workflow, color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
      { href: "/agents", label: "AI Agents", description: "Automated AI-driven agents", icon: Bot, color: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
      { href: "/workspace", label: "Workspace", description: "WhatsApp account settings", icon: Layers, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
      { href: "/leads/generate", label: "Lead Sourcing", description: "AI-powered lead generation", icon: Sparkles, color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    tiles: [
      { href: "/marketing/tele-calling", label: "Tele Calling", description: "Call campaigns and call logs", icon: Phone, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
      { href: "/marketing/content-creation", label: "Content Creation", description: "Content planning and assets", icon: PenSquare, color: "bg-pink-500/10 text-pink-600 dark:text-pink-400" },
      { href: "/marketing/paid-marketing", label: "Paid Marketing", description: "Ad campaigns and budgets", icon: Megaphone, color: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" },
    ],
  },
  {
    id: "office",
    label: "Office",
    tiles: [
      { href: "/products", label: "Products", description: "Product catalog and pricing", icon: Package, color: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
      { href: "/office", label: "Company Details", description: "Company profile and settings", icon: Building2, color: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" },
      { href: "/files", label: "Files", description: "Company documents and assets", icon: Folder, color: "bg-stone-500/10 text-stone-600 dark:text-stone-400" },
      { href: "/accounts", label: "Accounts", description: "Financial records and invoices", icon: IndianRupee, color: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400" },
      { href: "/user-management", label: "User Management", description: "Manage team members and roles", icon: Users2, color: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
      { href: "/activity-log", label: "Activity Log", description: "Audit trail and action history", icon: Clock, color: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
    ],
  },
];

export default function OverviewPage() {
  const [activeTab, setActiveTab] = useState("work");

  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 p-6">

        <div>
          <h1 className="text-2xl font-bold text-foreground">Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Quick access to all CRM modules</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tile grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tab.tiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tile.color}`}>
                <tile.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground group-hover:text-primary">{tile.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{tile.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
