"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HardDrive, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoogleDriveConfig } from "@/types";
import { toast } from "sonner";

// Workspace → Google Drive tab. One shared connection per BMW CRM
// account (like WhatsApp) — an admin connects once via OAuth, and
// every teammate's New Doc/New Sheet buttons create files under that
// same connected Google account.
export function GoogleDriveSettings() {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<GoogleDriveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/google-drive/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConfig(d?.config ?? null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const result = searchParams.get("drive");
    if (result === "connected") toast.success("Google Drive connected.");
    if (result === "error") toast.error("Could not connect Google Drive — try again.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Google Drive? Existing Docs/Sheets already created stay in Drive, but new ones can't be created until you reconnect.")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/google-drive/disconnect", { method: "POST" });
      if (!res.ok) {
        toast.error("Could not disconnect.");
        return;
      }
      setConfig(null);
      toast.success("Disconnected.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-8 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mt-4 max-w-lg">
      <div className="flex items-center gap-3 rounded-xl border border-border p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <HardDrive className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Google Drive</p>
          {config ? (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
              Connected as {config.connected_email ?? "unknown"}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Not connected</p>
          )}
        </div>
        {config ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : (
          <a
            href="/api/google-drive/connect"
            className="inline-flex h-8 shrink-0 items-center rounded-[10px] bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Connect
          </a>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        One shared connection for the whole workspace — not per person. Uses the narrow
        `drive.file` permission: BMW CRM can only see and manage files it creates itself
        (New Doc / New Sheet buttons), never anything else already in that Google account&apos;s
        Drive. New Docs/Sheets are set to &quot;anyone with the link can edit&quot; so any
        teammate can open them without extra setup — tighten that per-file in Drive itself
        if a specific document needs to stay more restricted.
      </p>
    </div>
  );
}
