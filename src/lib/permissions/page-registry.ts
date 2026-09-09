// ============================================================
// Page registry for the granular per-page CRUD permission grid
// (Office → User Management → Assign Permissions). Deliberately a
// plain TS constant, not a DB table — the set of pages changes when
// code changes, not at runtime, so there's no admin "add a new
// page" use case the way there is for e.g. Custom Fields options.
//
// `page_key` values are stable strings used as foreign-key-ish
// references in `user_page_permissions.page_key` — rename the
// label freely, never the key (existing grants would silently stop
// matching anything).
// ============================================================

export interface PageRegistryEntry {
  key: string;
  label: string;
  category: string;
}

export const PAGE_REGISTRY: PageRegistryEntry[] = [
  // Sales
  { key: "lead_sourcing", label: "Lead Sourcing", category: "Sales" },
  { key: "inbox", label: "Inbox", category: "Sales" },
  { key: "contacts", label: "Contacts", category: "Sales" },
  { key: "pipelines", label: "Pipelines", category: "Sales" },
  { key: "broadcasts", label: "Broadcasts", category: "Sales" },
  { key: "automations", label: "Automations", category: "Sales" },
  { key: "flows", label: "Flows", category: "Sales" },
  { key: "ai_agents", label: "AI Agents", category: "Sales" },
  { key: "workspace", label: "Workspace", category: "Sales" },
  // Clients
  { key: "client_directory", label: "Client Directory", category: "Clients" },
  { key: "client_leads", label: "Client Enquiry", category: "Clients" },
  { key: "future_clients", label: "Future Clients", category: "Clients" },
  // Projects
  { key: "projects", label: "Projects", category: "Projects" },
  { key: "kanban", label: "Kanban", category: "Projects" },
  { key: "daily_tasks", label: "Project Tasks", category: "Projects" },
  // Product
  { key: "products", label: "Products", category: "Product" },
  // Marketing
  { key: "marketing_tele_calling", label: "Tele Calling", category: "Marketing" },
  { key: "marketing_content_creation", label: "Content Creation", category: "Marketing" },
  { key: "marketing_paid_marketing", label: "Paid Marketing", category: "Marketing" },
  // Office
  { key: "company_details", label: "Company Details", category: "Office" },
  { key: "files", label: "Files", category: "Office" },
  { key: "accounts", label: "Accounts", category: "Office" },
  { key: "user_management", label: "User Management", category: "Office" },
  { key: "activity_log", label: "Activity Log", category: "Office" },
];

export const PAGE_CATEGORIES: string[] = [...new Set(PAGE_REGISTRY.map((p) => p.category))];

export interface PagePermissionDraft {
  page_key: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export function emptyPermissionDrafts(): PagePermissionDraft[] {
  return PAGE_REGISTRY.map((p) => ({
    page_key: p.key,
    can_create: false,
    can_read: false,
    can_update: false,
    can_delete: false,
  }));
}
