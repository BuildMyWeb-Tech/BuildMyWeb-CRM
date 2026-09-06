"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { AccountMember } from "@/types";

// `GET /api/account/members` is fetched independently by nearly every
// page that needs an assignee list — Daily Tasks, Kanban, Client
// Enquiry, each Marketing sub-page, the New User wizard — the exact
// same request, once per mounted consumer, on every navigation. Same
// fix as fetchPagePermissionRows() in use-page-permissions.ts: a
// short-lived module cache so the first caller per account starts
// the fetch and everyone else awaits that same in-flight promise
// instead of firing their own.
//
// Cached for 30s (not indefinitely, unlike permissions) — the roster
// changes more often in practice (new hires, role changes reflected
// via this same list) and callers here don't have a natural
// invalidation point the way permission edits do.
const CACHE_TTL_MS = 30_000;
let cache: { accountId: string; promise: Promise<AccountMember[]>; fetchedAt: number } | null = null;

export function fetchAccountMembers(accountId: string): Promise<AccountMember[]> {
  if (cache && cache.accountId === accountId && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.promise;
  }

  const promise = fetch("/api/account/members")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.members ?? []) as AccountMember[])
    .catch((err) => {
      cache = null;
      throw err;
    });

  cache = { accountId, promise, fetchedAt: Date.now() };
  return promise;
}

export function useAccountMembers(): { members: AccountMember[]; loading: boolean } {
  const { accountId } = useAuth();
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(!!accountId);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    fetchAccountMembers(accountId)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return { members, loading };
}
