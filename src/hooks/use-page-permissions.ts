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

export interface PagePermissionRow {
  page_key: string;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export interface PagePermissions {
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  loading: boolean;
}

const ALLOW_ALL: Omit<PagePermissions, "loading"> = {
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: true,
};

// Every page that calls usePagePermissions() for the SAME user, plus
// the sidebar's own denied-page-key filtering, used to each fire
// their own `GET /api/users/{id}/permissions` — the exact same
// request, duplicated per mounted consumer on every navigation. This
// module-level cache (keyed by user id) means the first caller on a
// page starts the fetch and every other caller for that same user —
// this render, or the sidebar rendering alongside it — awaits the
// same in-flight promise instead of firing its own round trip.
// Cleared on fetch failure so a transient error doesn't wedge every
// future caller behind a rejected promise forever.
const rowsCache = new Map<string, Promise<PagePermissionRow[]>>();

export function fetchPagePermissionRows(userId: string): Promise<PagePermissionRow[]> {
  const cached = rowsCache.get(userId);
  if (cached) return cached;

  const promise = fetch(`/api/users/${userId}/permissions`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.permissions ?? []) as PagePermissionRow[])
    .catch((err) => {
      rowsCache.delete(userId);
      throw err;
    });

  rowsCache.set(userId, promise);
  return promise;
}

export function usePagePermissions(pageKey: string): PagePermissions {
  const { user } = useAuth();
  const [state, setState] = useState<PagePermissions>({ ...ALLOW_ALL, loading: !!user?.id });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchPagePermissionRows(user.id)
      .then((rows) => {
        if (cancelled) return;
        const row = rows.find((r) => r.page_key === pageKey);
        setState({
          canCreate: row ? row.can_create : true,
          canRead: row ? row.can_read : true,
          canUpdate: row ? row.can_update : true,
          canDelete: row ? row.can_delete : true,
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
