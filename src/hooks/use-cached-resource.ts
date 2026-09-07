"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Stale-while-revalidate for a page's primary list fetch. Every list
// page today shows a blank spinner on every single visit, even when
// you were just on this exact page five seconds ago and nothing
// changed — the perceived "slow to load" complaint is mostly this,
// not actual server latency. Fix: render whatever was cached from
// the last successful load INSTANTLY (localStorage, so it survives a
// full page reload too, not just client-side navigation), then kick
// off a real fetch in the background and swap in the fresh data
// (and re-cache it) when it lands. A cold cache falls back to the
// normal "loading" behavior — nothing regresses, it only gets faster
// on repeat visits.
//
// Deliberately per-hook-instance, not a shared module cache like
// fetchAccountMembers/fetchPagePermissionRows — those dedupe
// concurrent identical requests across components; this is about
// making a single page's own re-visits feel instant, which is a
// different problem (persisting across full reloads, not sharing
// one in-flight request).
export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
): { data: T | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(() => {
    if (!key || typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(`cache:${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(data === null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(() => {
    if (!key) return;
    fetcherRef.current()
      .then((fresh) => {
        setData(fresh);
        try {
          window.localStorage.setItem(`cache:${key}`, JSON.stringify(fresh));
        } catch {
          // Storage full or unavailable (private browsing) — the
          // in-memory state above still updated, only the "instant on
          // next reload" part is lost. Not worth surfacing to the user.
        }
      })
      .catch((err) => {
        console.error(`[useCachedResource:${key}] refresh failed:`, err);
      })
      .finally(() => setLoading(false));
  }, [key]);

  useEffect(() => {
    if (!key) return;
    refresh();
  }, [key, refresh]);

  return { data, loading, refresh };
}
