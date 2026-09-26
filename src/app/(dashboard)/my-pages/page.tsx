"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { CRM_MODULES, GLOBAL_NAV_ITEMS } from "@/lib/modules";

// All CRM pages available to add as tabs.
const ALL_PAGES = [
  ...GLOBAL_NAV_ITEMS.map((i) => ({ href: i.href, label: i.labelKey, group: "General" })),
  ...CRM_MODULES.flatMap((mod) =>
    mod.items.map((i) => ({ href: i.href, label: i.labelKey, group: mod.labelKey })),
  ),
].filter((p) => p.href !== "/my-pages");

// Static label map (labelKey → human-readable) pulled from common sidebar keys.
const LABEL_MAP: Record<string, string> = {
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
  moduleClients: "Clients",
  moduleProjects: "Projects",
  moduleProduct: "Product",
  moduleSales: "Sales",
  moduleMarketing: "Marketing",
  moduleOffice: "Office",
  General: "General",
};

function label(key: string) {
  return LABEL_MAP[key] ?? key;
}

interface TabConfig {
  id: string;
  href: string;
  title: string;
}

function storageKey(userId: string) {
  return `my-pages-tabs-${userId}`;
}

function loadTabs(userId: string): TabConfig[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as TabConfig[]) : [];
  } catch {
    return [];
  }
}

function saveTabs(userId: string, tabs: TabConfig[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(tabs));
  } catch {}
}

export default function MyPagesPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [tabs, setTabs] = useState<TabConfig[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  // Load saved tabs once the user id is known.
  useEffect(() => {
    if (!userId) return;
    const saved = loadTabs(userId);
    setTabs(saved);
    if (saved.length > 0) setActiveTab(saved[0].id);
  }, [userId]);

  function addPage(page: { href: string; label: string }) {
    if (tabs.some((t) => t.href === page.href)) {
      // Already added — just switch to it.
      const existing = tabs.find((t) => t.href === page.href)!;
      setActiveTab(existing.id);
      setShowPicker(false);
      return;
    }
    const id = `tab-${Date.now()}`;
    const next: TabConfig[] = [...tabs, { id, href: page.href, title: label(page.label) }];
    setTabs(next);
    setActiveTab(id);
    saveTabs(userId, next);
    setShowPicker(false);
    setSearch("");
  }

  function removeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    saveTabs(userId, next);
    if (activeTab === id) setActiveTab(next[0]?.id ?? null);
  }

  const filteredPages = ALL_PAGES.filter((p) => {
    const q = search.toLowerCase();
    return label(p.label).toLowerCase().includes(q) || p.href.toLowerCase().includes(q);
  });

  // Group by module
  const grouped = filteredPages.reduce<Record<string, typeof filteredPages>>((acc, p) => {
    const g = label(p.group);
    acc[g] ??= [];
    acc[g].push(p);
    return acc;
  }, {});

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <LayoutGrid className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground">My Pages</h1>
          <p className="text-xs text-muted-foreground">Add any CRM page as a tab — your customisation is saved automatically.</p>
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

      {tabs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
          <div className="rounded-2xl bg-muted p-6">
            <LayoutGrid className="h-10 w-10 text-muted-foreground/60 mx-auto" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground">No pages added yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Click <strong>Add Page</strong> to pick any CRM page. Each page opens as a full tab with all its functionality.
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
          {/* Tab bar */}
          <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-muted/30 px-4 scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-b-2 border-primary bg-background text-foreground -mb-px"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="max-w-32 truncate">{tab.title}</span>
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

          {/* Iframe panels — all loaded, only active one is visible so
              state and scroll position are preserved when switching tabs. */}
          <div className="flex-1 overflow-hidden">
            {tabs.map((tab) => (
              <iframe
                key={tab.id}
                src={tab.href}
                title={tab.title}
                className={cn(
                  "h-full w-full border-0",
                  activeTab === tab.id ? "block" : "hidden",
                )}
                // Allow same-origin access so the embedded pages
                // work with the existing auth/cookie session.
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              />
            ))}
          </div>
        </>
      )}

      {/* Page picker modal */}
      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="relative flex w-[480px] max-h-[70vh] flex-col rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
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

            {/* Search */}
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

            {/* Page list */}
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
                <p className="py-6 text-center text-sm text-muted-foreground">No pages match &ldquo;{search}&rdquo;</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
