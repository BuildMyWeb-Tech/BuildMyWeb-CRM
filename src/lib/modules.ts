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
  Bell,
  Bot,
  Building2,
  GitBranch,
  KanbanSquare,
  LayoutDashboard,
  MessageSquare,
  Radio,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

export interface ModuleNavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  minRole: AccountRole;
  /** Renders a small "Beta" chip after the label. Cosmetic only. */
  beta?: boolean;
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
  { href: "/notifications", labelKey: "notifications", icon: Bell, minRole: "viewer" },
];

export const CRM_MODULES: CrmModule[] = [
  {
    id: "sales",
    labelKey: "moduleSales",
    minRole: "viewer",
    items: [
      { href: "/inbox", labelKey: "inbox", icon: MessageSquare, minRole: "viewer" },
      { href: "/contacts", labelKey: "contacts", icon: Users, minRole: "viewer" },
      { href: "/pipelines", labelKey: "pipelines", icon: GitBranch, minRole: "viewer" },
      { href: "/broadcasts", labelKey: "broadcasts", icon: Radio, minRole: "agent" },
      { href: "/automations", labelKey: "automations", icon: Zap, minRole: "agent" },
      { href: "/flows", labelKey: "flows", icon: Workflow, minRole: "agent", beta: true },
      { href: "/agents", labelKey: "aiAgents", icon: Bot, minRole: "agent" },
    ],
  },
  {
    id: "projects",
    labelKey: "moduleProjects",
    minRole: "viewer",
    items: [
      { href: "/projects", labelKey: "projects", icon: KanbanSquare, minRole: "viewer" },
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
      { href: "/office", labelKey: "office", icon: Building2, minRole: "admin" },
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

export function visibleModules(role: AccountRole | null | undefined): CrmModule[] {
  if (!role) return [];
  return CRM_MODULES.map((m) => ({
    ...m,
    items: m.items.filter((item) => hasMinRole(role, item.minRole)),
  })).filter((m) => m.items.length > 0 && hasMinRole(role, m.minRole));
}