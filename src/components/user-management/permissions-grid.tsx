"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { PAGE_REGISTRY, PAGE_CATEGORIES, type PagePermissionDraft } from "@/lib/permissions/page-registry";

// Shared CRUD+Print permission grid — used by both the New User
// wizard (step 2) and the Edit Permissions dialog, so they can't
// drift out of sync with each other the way Kanban/Daily Tasks'
// board settings almost did earlier in this build.
//
// Built as CSS grid (divs), not an HTML <table> — Base UI's Checkbox
// renders a hidden native <input> positioned absolutely relative to
// its nearest positioned ancestor. A plain <table><td> doesn't
// reliably give it one, which is what produced the stray vertical
// line artifact in a real table layout. Every cell here is
// `relative` for exactly that reason, not decoration.

const COLUMNS = [
  { field: "can_create", label: "Create", color: "text-emerald-500" },
  { field: "can_read", label: "Read", color: "text-blue-400" },
  { field: "can_update", label: "Update", color: "text-amber-400" },
  { field: "can_delete", label: "Delete", color: "text-red-400" },
  { field: "can_print", label: "Print", color: "text-violet-400" },
] as const;

// Wide first column for the page name, five equal comfortable
// columns for the checkboxes — matches BMW's "increase the width as
// much as possible" ask directly via the column template itself,
// not just a wider dialog around a cramped grid.
const GRID_TEMPLATE = "minmax(180px,1.5fr) repeat(5, minmax(110px,1fr))";

interface PermissionsGridProps {
  permissions: PagePermissionDraft[];
  onToggle: (pageKey: string, field: keyof Omit<PagePermissionDraft, "page_key">, checked: boolean) => void;
}

export function PermissionsGrid({ permissions, onToggle }: PermissionsGridProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div className="min-w-[720px]" style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}>
        {/* Header row */}
        <div className="border-b border-border px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Page
        </div>
        {COLUMNS.map((col) => (
          <div
            key={col.field}
            className={`border-b border-border px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider ${col.color}`}
          >
            {col.label}
          </div>
        ))}

        {PAGE_CATEGORIES.map((category) => (
          <CategorySection key={category} category={category} permissions={permissions} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

function CategorySection({
  category,
  permissions,
  onToggle,
}: {
  category: string;
  permissions: PagePermissionDraft[];
  onToggle: PermissionsGridProps["onToggle"];
}) {
  const pages = PAGE_REGISTRY.filter((p) => p.category === category);
  return (
    <>
      <div className="col-span-6 bg-muted/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
        {category}
      </div>
      {pages.map((page) => {
        const draft = permissions.find((p) => p.page_key === page.key);
        if (!draft) return null;
        return (
          <div key={page.key} className="contents">
            <div className="flex items-center border-b border-border px-4 py-3 text-sm text-foreground">
              {page.label}
            </div>
            {COLUMNS.map((col) => (
              <div
                key={col.field}
                className="relative flex items-center justify-center border-b border-border py-3"
              >
                <Checkbox
                  checked={draft[col.field]}
                  onCheckedChange={(c) => onToggle(page.key, col.field, c === true)}
                  className="size-5"
                />
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
