"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { MobileBottomNav, MobileFAB } from "@/components/layout/mobile-nav";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const dbSyncedRef = useRef(false);

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Desktop collapse — persisted to localStorage (instant) + Supabase (cross-device).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });

  // Sync from Supabase once user is known (cross-device initial load)
  useEffect(() => {
    if (!user?.id || dbSyncedRef.current) return;
    dbSyncedRef.current = true;
    const sb = createClient();
    sb.from("user_preferences").select("value").eq("user_id", user.id).eq("key", "sidebar-collapsed").maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const val = (data.value as { collapsed?: boolean }).collapsed;
        if (typeof val === "boolean") {
          setSidebarCollapsed(val);
          try { window.localStorage.setItem("sidebar-collapsed", String(val)); } catch {}
        }
      });
  }, [user?.id]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      // Sync to Supabase in background
      if (user?.id) {
        const sb = createClient();
        sb.from("user_preferences").upsert(
          { user_id: user.id, key: "sidebar-collapsed", value: { collapsed: next }, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        ).then(() => {});
      }
      return next;
    });
  }, [user?.id]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        {/* pb-20 gives clearance for the mobile bottom nav on small screens. */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 lg:pb-6">
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          {children}
        </main>
      </div>
      <MobileBottomNav />
      <MobileFAB />
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
