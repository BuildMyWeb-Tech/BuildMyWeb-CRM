"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

// Reusable per-page permission check — the foundation for hiding
// Create/Edit/Delete buttons (not just sidebar links) based on the
// granular grid from Office → User Management. Same philosophy as
// the sidebar's own filtering (src/components/layout/sidebar.tsx):
// this only RESTRICTS beyond the existing coarse role, never grants
// beyond it. A user with no explicit row for `pageKey` (the default
// for everyone except users created through the New User wizard)
// gets every flag back as `true` — i.e. "not additionally
// restricted," not "definitely allowed." The coarse account_role is
// still the real backend gate.
//
// Usage: `const { canCreate, canUpdate, canDelete } = usePagePermissions("client_directory");`
// then wrap buttons: `{canCreate && <Button>New client</Button>}`.
//
// NOTE — scope as shipped: this hook exists and works, but is not
// yet wired into every page's buttons across the CRM. That's a
// separate, large rollout (one page at a time) — this is the
// foundation for it, not the rollout itself.

export interface PagePermissions {
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canPrint: boolean;
  loading: boolean;
}

const ALLOW_ALL: Omit<PagePermissions, "loading"> = {
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: true,
  canPrint: true,
};

export function usePagePermissions(pageKey: string): PagePermissions {
  const { user } = useAuth();
  const [state, setState] = useState<PagePermissions>({ ...ALLOW_ALL, loading: !!user?.id });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetch(`/api/users/${user.id}/permissions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const rows: Array<{
          page_key: string;
          can_create: boolean;
          can_read: boolean;
          can_update: boolean;
          can_delete: boolean;
          can_print: boolean;
        }> = d?.permissions ?? [];
        const row = rows.find((r) => r.page_key === pageKey);
        setState({
          canCreate: row ? row.can_create : true,
          canRead: row ? row.can_read : true,
          canUpdate: row ? row.can_update : true,
          canDelete: row ? row.can_delete : true,
          canPrint: row ? row.can_print : true,
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ ...ALLOW_ALL, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, pageKey]);

  return state;
}
