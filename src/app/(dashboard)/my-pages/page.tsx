"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import dynamic from "next/dynamic";
import { LayoutGrid, Plus, X, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { CRM_MODULES, GLOBAL_NAV_ITEMS } from "@/lib/modules";

// ---------------------------------------------------------------------------
// Component registry — maps href to a lazily-loaded page component.
// Only pages that have a simple (no dynamic-segment) route are included.
// ---------------------------------------------------------------------------
const PAGE_REGISTRY: Record<string, React.ComponentType> = {
  "/overview": dynamic(() => import("@/app/(dashboard)/overview/page")),
  "/dashboard": dynamic(() => import("@/app/(dashboard)/dashboard/page")),
  "/business-dashboard": dynamic(() => import("@/app/(dashboard)/business-dashboard/page")),
  "/clients": dynamic(() => import("@/app/(dashboard)/clients/page")),
  "/client-leads": dynamic(() => import("@/app/(dashboard)/client-leads/page")),
  "/future-clients": dynamic(() => import("@/app/(dashboard)/future-clients/page")),
  "/reviews": dynamic(() => import("@/app/(dashboard)/reviews/page")),
  "/projects": dynamic(() => import("@/app/(dashboard)/projects/page")),
  "/daily-tasks": dynamic(() => import("@/app/(dashboard)/daily-tasks/page")),
  "/projects/chat": dynamic(() => import("@/app/(dashboard)/projects/chat/page")),
  "/projects/automations": dynamic(() => import("@/app/(dashboard)/projects/automations/page")),
  "/time-tracker": dynamic(() => import("@/app/(dashboard)/time-tracker/page")),
  "/products": dynamic(() => import("@/app/(dashboard)/products/page")),
  "/product-tasks": dynamic(() => import("@/app/(dashboard)/product-tasks/page")),
  "/contacts": dynamic(() => import("@/app/(dashboard)/contacts/page")),
  "/inbox": dynamic(() => import("@/app/(dashboard)/inbox/page")),
  "/pipelines": dynamic(() => import("@/app/(dashboard)/pipelines/page")),
  "/broadcasts": dynamic(() => import("@/app/(dashboard)/broadcasts/page")),
  "/automations": dynamic(() => import("@/app/(dashboard)/automations/page")),
  "/flows": dynamic(() => import("@/app/(dashboard)/flows/page")),
  "/agents": dynamic(() => import("@/app/(dashboard)/agents/page")),
  "/workspace": dynamic(() => import("@/app/(dashboard)/workspace/page")),
  "/marketing/tele-calling": dynamic(() => import("@/app/(dashboard)/marketing/tele-calling/page")),
  "/marketing/content-creation": dynamic(() => import("@/app/(dashboard)/marketing/content-creation/page")),
  "/marketing/paid-marketing": dynamic(() => import("@/app/(dashboard)/marketing/paid-marketing/page")),
  "/office": dynamic(() => import("@/app/(dashboard)/office/page")),
  "/files": dynamic(() => import("@/app/(dashboard)/files/page")),
  "/accounts": dynamic(() => import("@/app/(dashboard)/accounts/page")),
  "/user-management": dynamic(() => import("@/app/(dashboard)/user-management/page")),
  "/activity-log": dynamic(() => import("@/app/(dashboard)/activity-log/page")),
  "/whatsapp-connect": dynamic(() => import("@/app/(dashboard)/whatsapp-connect/page")),
  "/expenses": dynamic(() => import("@/app/(dashboard)/expenses/page")),
  "/routine": dynamic(() => import("@/app/(dashboard)/routine/page")),
  "/notifications": dynamic(() => import("@/app/(dashboard)/notifications/page")),
  "/lead-finder": dynamic(() => import("@/app/(dashboard)/lead-finder/page")),
  "/kanban": dynamic(() => import("@/app/(dashboard)/kanban/page")),
};

// ---------------------------------------------------------------------------
// Available pages list (from sidebar config, excluding my-pages itself)
// ---------------------------------------------------------------------------
const ALL_PAGES = [
  ...GLOBAL_NAV_ITEMS.map((i) => ({ href: i.href, label: i.labelKey, group: "General" })),
  ...CRM_MODULES.flatMap((mod) =>
    mod.items.map((i) => ({ href: i.href, label: i.labelKey, group: mod.labelKey })),
  ),
  { href: "/routine", label: "routine", group: "Personal" },
  { href: "/notifications", label: "notifications", group: "Personal" },
  { href: "/daily-tasks", label: "dailyTasksTodo", group: "Personal" },
  { href: "/inbox", label: "messages", group: "Personal" },
].filter((p) => p.href !== "/my-pages" && p.href in PAGE_REGISTRY);

const LABEL_MAP: Record<string, string> = {
  myWork: "My Work",
  moduleClients: "Clients",
  moduleProjects: "Projects",
  moduleProduct: "Product",
  moduleSales: "Sales",
  moduleMarketing: "Marketing",
  moduleOffice: "Office",
  dashboard: "Dashboard",
  businessDashboard: "Business Dashboard",
  clientDirectory: "Client Directory",
  clientLeads: "Client Enquiry",
  futureClients: "Future Clients",
  reviews: "Client Reviews",
  projects: "Projects",
  dailyTasks: "Project Tasks",
  projectChats: "Project Chats",
  crmAutomations: "Task Automation",
  timeTracker: "Time Tracker",
  products: "Products",
  productTasks: "Product Tasks",
  leadSourcing: "Lead Sourcing",
  inbox: "Inbox",
  contacts: "Leads Captured",
  pipelines: "Pipelines",
  broadcasts: "Broadcasts",
  automations: "Automations",
  flows: "Flows",
  aiAgents: "AI Agents",
  workspace: "Workspace",
  teleCalling: "Tele Calling",
  contentCreation: "Content Creation",
  paidMarketing: "Paid Marketing",
  companyDetails: "Company Details",
  files: "Files",
  accounts: "Accounts",
  userManagement: "User Management",
  activityLog: "Activity Log",
  whatsappConnect: "WhatsApp Connect",
  expenses: "Expenses",
  routine: "Routine",
  notifications: "Notifications",
  dailyTasksTodo: "To Do",
  messages: "Messages",
  leadFinder: "Lead Finder",
  kanban: "Kanban",
  office: "Office",
};

function label(key: string) {
  return LABEL_MAP[key] ?? key;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------
interface TabConfig { id: string; href: string; title: string }

function storageKey(userId: string) { return `my-pages-tabs-${userId}`; }
function activeKey(userId: string) { return `my-pages-active-${userId}`; }

function loadTabs(userId: string): TabConfig[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as TabConfig[]) : [];
  } catch { return []; }
}

function saveTabs(userId: string, tabs: TabConfig[]) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(tabs)); } catch {}
}

function saveActiveTab(userId: string, tabId: string) {
  try { localStorage.setItem(activeKey(userId), tabId); } catch {}
}

function loadActiveTab(userId: string): string | null {
  try { return localStorage.getItem(activeKey(userId)); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function MyPagesPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [tabs, setTabs] = useState<TabConfig[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    const saved = loadTabs(userId);
    setTabs(saved);
    const lastActive = loadActiveTab(userId);
    const initial = (lastActive && saved.find((t) => t.id === lastActive)) ? lastActive : (saved[0]?.id ?? null);
    setActiveTab(initial);
  }, [userId]);

  function switchTab(id: string) {
    setActiveTab(id);
    if (userId) saveActiveTab(userId, id);
  }

  function handleDragStart(idx: number) { setDragSrcIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragSrcIdx === null || dragSrcIdx === idx) return;
    const next = [...tabs];
    const [moved] = next.splice(dragSrcIdx, 1);
    next.splice(idx, 0, moved);
    setTabs(next);
    setDragSrcIdx(idx);
    saveTabs(userId, next);
  }
  function handleDragEnd() { setDragSrcIdx(null); }

  function addPage(page: { href: string; label: string }) {
    const existing = tabs.find((t) => t.href === page.href);
    if (existing) { switchTab(existing.id); setShowPicker(false); return; }
    const id = `tab-${Date.now()}`;
    const next: TabConfig[] = [...tabs, { id, href: page.href, title: label(page.label) }];
    setTabs(next); switchTab(id);
    saveTabs(userId, next);
    setShowPicker(false); setSearch("");
  }

  function removeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next); saveTabs(userId, next);
    if (activeTab === id) {
      const newActive = next[0]?.id ?? null;
      setActiveTab(newActive);
      if (newActive && userId) saveActiveTab(userId, newActive);
    }
  }

  const filteredPages = ALL_PAGES.filter((p) => {
    const q = search.toLowerCase();
    return label(p.label).toLowerCase().includes(q) || p.href.toLowerCase().includes(q);
  });

  const grouped = filteredPages.reduce<Record<string, typeof filteredPages>>((acc, p) => {
    const g = label(p.group);
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <LayoutGrid className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground">My Pages</h1>
          <p className="text-xs text-muted-foreground">Combine any CRM pages into one workspace — your layout is saved automatically.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Page
        </button>
      </div>

      {/* ── Empty state ── */}
      {tabs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
          <div className="rounded-2xl bg-muted p-6">
            <LayoutGrid className="h-10 w-10 text-muted-foreground/60 mx-auto" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground">No pages added yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Click <strong>Add Page</strong> to pick any CRM page. Each page opens as a full tab with all its filters, tables, and actions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Page
          </button>
        </div>
      ) : (
        <>
          {/* ── Tab bar ── */}
          <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-muted/30 px-4 scrollbar-none">
            {tabs.map((tab, idx) => (
              <button
                key={tab.id}
                type="button"
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  "group flex shrink-0 cursor-grab items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium transition-colors active:cursor-grabbing",
                  activeTab === tab.id
                    ? "border-b-2 border-primary bg-background text-foreground -mb-px"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  dragSrcIdx === idx && "opacity-50",
                )}
              >
                <span className="max-w-40 truncate">{LABEL_MAP[tab.title] ?? tab.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => removeTab(tab.id, e)}
                  onKeyDown={(e) => e.key === "Enter" && removeTab(tab.id, e as never)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted/80 transition-opacity"
                  aria-label={`Remove ${tab.title}`}
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="ml-1 flex shrink-0 items-center gap-1 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          {/* ── Tab panels — all mounted, only active shown ── */}
          <div className="relative flex-1 overflow-auto">
            {tabs.map((tab) => {
              const PageComponent = PAGE_REGISTRY[tab.href];
              if (!PageComponent) return null;
              return (
                <div
                  key={tab.id}
                  className={cn(
                    "absolute inset-0 overflow-auto",
                    activeTab === tab.id ? "z-10 block" : "z-0 invisible pointer-events-none",
                  )}
                >
                  <Suspense
                    fallback={
                      <div className="flex h-40 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    }
                  >
                    <PageComponent />
                  </Suspense>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Page picker modal ── */}
      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="relative flex w-[480px] max-h-[70vh] flex-col rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">Add a Page</h2>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-border px-5 py-3">
              <input
                type="text"
                placeholder="Search pages…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
              {Object.entries(grouped).map(([group, pages]) => (
                <div key={group}>
                  <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {group}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {pages.map((page) => {
                      const alreadyAdded = tabs.some((t) => t.href === page.href);
                      return (
                        <button
                          key={page.href}
                          type="button"
                          onClick={() => addPage({ href: page.href, label: page.label })}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left transition-colors",
                            alreadyAdded
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "bg-muted/40 text-foreground hover:bg-muted/80 border border-border",
                          )}
                        >
                          <span className="flex-1 truncate">{label(page.label)}</span>
                          {alreadyAdded && (
                            <span className="shrink-0 text-[10px] text-primary/70">Added</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(grouped).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No pages match &ldquo;{search}&rdquo;
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
