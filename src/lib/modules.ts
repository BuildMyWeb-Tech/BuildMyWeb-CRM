// ============================================================
// CRM module registry — single source of truth for which nav
// sections/items exist and who can see them.
//
// The sidebar renders purely from this array; adding a new module
// (Sales/Projects/Office today, a future third-party one tomorrow)
// means adding one entry here, not touching sidebar.tsx.
//
// `minRole` gates VISIBILITY only (can this role see the page link
// exists at all) — it mirrors the same account_role_enum ranking
// `is_account_member()` uses in Postgres. It is NOT the CRUD
// permission layer: once a role can see a module, what it can
// create/edit/delete inside that module is enforced by that
// module's own API routes + RLS policies (and, for Office, will be
// further narrowed per-role by `has_module_access()` once
// 043_module_access.sql is applied in Phase 4).
// ============================================================

import type { AccountRole } from "@/lib/auth/roles";
import { hasMinRole } from "@/lib/auth/roles";
import {
  Bot,
  Building2,
  Clock,
  Folder,
  GitBranch,
  IndianRupee,
  KanbanSquare,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  Megaphone,
  MessageSquare,
  Package,
  PenSquare,
  Phone,
  Radio,
  Rows3,
  UserPlus,
  Users,
  Users2,
  Workflow,
  Zap,
  Sparkles,
} from "lucide-react";

export interface ModuleNavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  minRole: AccountRole;
  /** Renders a small "Beta" chip after the label. Cosmetic only. */
  beta?: boolean;
  /**
   * Matches a key in src/lib/permissions/page-registry.ts. When set,
   * the sidebar additionally hides this item for a user who has an
   * EXPLICIT can_read:false row for this page — absence of any row
   * (the default for everyone except users created through the new
   * User Management wizard) never restricts anything, only an
   * explicit denial does. Items without a pageKey (Dashboard,
   * Notifications) are never restricted this way.
   */
  pageKey?: string;
}

export interface CrmModule {
  id: string;
  labelKey: string;
  /** Minimum role for the module SECTION to render at all. */
  minRole: AccountRole;
  items: ModuleNavItem[];
}

// Global links that sit above every module (not module-specific:
// Dashboard aggregates all modules' data, Notifications spans them).
export const GLOBAL_NAV_ITEMS: ModuleNavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, minRole: "viewer" },
  // No pageKey, same as Dashboard — it only aggregates data other
  // pages already gate their own way (project tasks, enquiry tasks,
  // active projects), nothing new to grant/deny here.
  { href: "/overview", labelKey: "overview", icon: Rows3, minRole: "viewer" },
];

// Order here is the sidebar's render order — Client, Project,
// Product, Sales, Marketing, Office, per BMW's requested layout.
export const CRM_MODULES: CrmModule[] = [
  {
    id: "clients",
    labelKey: "moduleClients",
    minRole: "viewer",
    items: [
      { href: "/clients", labelKey: "clientDirectory", icon: Users, minRole: "viewer", pageKey: "client_directory" },
      { href: "/client-leads", labelKey: "clientLeads", icon: UserPlus, minRole: "viewer", pageKey: "client_leads" },
      { href: "/future-clients", labelKey: "futureClients", icon: Sparkles, minRole: "viewer", pageKey: "future_clients" },
    ],
  },
  {
    id: "projects",
    labelKey: "moduleProjects",
    minRole: "viewer",
    items: [
      { href: "/projects", labelKey: "projects", icon: KanbanSquare, minRole: "viewer", pageKey: "projects" },
      { href: "/kanban", labelKey: "kanban", icon: LayoutGrid, minRole: "viewer", pageKey: "kanban" },
      { href: "/daily-tasks", labelKey: "dailyTasks", icon: ListTodo, minRole: "viewer", pageKey: "daily_tasks" },
      { href: "/projects/chat", labelKey: "projectChats", icon: MessageSquare, minRole: "viewer", pageKey: "projects" },
    ],
  },
  {
    id: "product",
    labelKey: "moduleProduct",
    minRole: "viewer",
    items: [
      { href: "/products", labelKey: "products", icon: Package, minRole: "viewer", pageKey: "products" },
    ],
  },
  {
    id: "sales",
    labelKey: "moduleSales",
    minRole: "viewer",
    items: [
      { href: "/leads/generate", labelKey: "leadSourcing", icon: Sparkles, minRole: "agent", pageKey: "lead_sourcing" },
      { href: "/inbox", labelKey: "inbox", icon: MessageSquare, minRole: "viewer", pageKey: "inbox" },
      { href: "/contacts", labelKey: "contacts", icon: Users, minRole: "viewer", pageKey: "contacts" },
      { href: "/pipelines", labelKey: "pipelines", icon: GitBranch, minRole: "viewer", pageKey: "pipelines" },
      { href: "/broadcasts", labelKey: "broadcasts", icon: Radio, minRole: "agent", pageKey: "broadcasts" },
      { href: "/automations", labelKey: "automations", icon: Zap, minRole: "agent", pageKey: "automations" },
      { href: "/flows", labelKey: "flows", icon: Workflow, minRole: "agent", beta: true, pageKey: "flows" },
      { href: "/agents", labelKey: "aiAgents", icon: Bot, minRole: "agent", pageKey: "ai_agents" },
      { href: "/workspace", labelKey: "workspace", icon: Layers, minRole: "viewer", pageKey: "workspace" },
    ],
  },
  {
    id: "marketing",
    labelKey: "moduleMarketing",
    minRole: "viewer",
    items: [
      { href: "/marketing/tele-calling", labelKey: "teleCalling", icon: Phone, minRole: "viewer", pageKey: "marketing_tele_calling" },
      { href: "/marketing/content-creation", labelKey: "contentCreation", icon: PenSquare, minRole: "viewer", pageKey: "marketing_content_creation" },
      { href: "/marketing/paid-marketing", labelKey: "paidMarketing", icon: Megaphone, minRole: "viewer", pageKey: "marketing_paid_marketing" },
    ],
  },
  {
    id: "office",
    labelKey: "moduleOffice",
    // Office holds company docs + bills — admin+ only by default,
    // matching how whatsapp_config/ai_config are treated in the
    // base app. Loosen to "agent" here later if that's ever wrong.
    minRole: "admin",
    items: [
      { href: "/office", labelKey: "companyDetails", icon: Building2, minRole: "admin", pageKey: "company_details" },
      { href: "/files", labelKey: "files", icon: Folder, minRole: "admin", pageKey: "files" },
      { href: "/accounts", labelKey: "accounts", icon: IndianRupee, minRole: "admin", pageKey: "accounts" },
      { href: "/user-management", labelKey: "userManagement", icon: Users2, minRole: "admin", pageKey: "user_management" },
      { href: "/activity-log", labelKey: "activityLog", icon: Clock, minRole: "admin", pageKey: "activity_log" },
    ],
  },
];

/**
 * Filters GLOBAL_NAV_ITEMS + CRM_MODULES down to what `role` may
 * see. A module section disappears entirely once none of its items
 * are visible (rather than rendering an empty header).
 */
export function visibleGlobalItems(role: AccountRole | null | undefined): ModuleNavItem[] {
  if (!role) return [];
  return GLOBAL_NAV_ITEMS.filter((item) => hasMinRole(role, item.minRole));
}

export function visibleModules(
  role: AccountRole | null | undefined,
  deniedPageKeys?: ReadonlySet<string>,
): CrmModule[] {
  if (!role) return [];
  return CRM_MODULES.map((m) => ({
    ...m,
    items: m.items.filter(
      (item) => hasMinRole(role, item.minRole) && !(item.pageKey && deniedPageKeys?.has(item.pageKey)),
    ),
  })).filter((m) => m.items.length > 0 && hasMinRole(role, m.minRole));
}
