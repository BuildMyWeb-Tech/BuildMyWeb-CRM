"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PermissionsGrid } from "@/components/user-management/permissions-grid";
import { emptyPermissionDrafts, type PagePermissionDraft } from "@/lib/permissions/page-registry";
import type { UserPagePermission } from "@/types";
import { toast } from "sonner";

// Same grid as step 2 of the New User wizard, reused here for
// editing an EXISTING user's permissions after the fact — the
// wizard only covers assigning them at creation time.

interface EditPermissionsDialogProps {
  userId: string | null;
  username: string;
  onClose: () => void;
}

export function EditPermissionsDialog({ userId, username, onClose }: EditPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<PagePermissionDraft[]>(emptyPermissionDrafts());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`/api/users/${userId}/permissions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const existing: UserPagePermission[] = d?.permissions ?? [];
        setPermissions(
          emptyPermissionDrafts().map((draft) => {
            const found = existing.find((e) => e.page_key === draft.page_key);
            return found
              ? {
                  page_key: draft.page_key,
                  can_create: found.can_create,
                  can_read: found.can_read,
                  can_update: found.can_update,
                  can_delete: found.can_delete,
                }
              : draft;
          }),
        );
      })
      .finally(() => setLoading(false));
  }, [userId]);

  function toggleAll(checked: boolean) {
    setPermissions((prev) =>
      prev.map((p) => ({ ...p, can_create: checked, can_read: checked, can_update: checked, can_delete: checked })),
    );
  }

  function toggleCell(pageKey: string, field: keyof Omit<PagePermissionDraft, "page_key">, checked: boolean) {
    setPermissions((prev) => prev.map((p) => (p.page_key === pageKey ? { ...p, [field]: checked } : p)));
  }

  const allChecked = permissions.every((p) => p.can_create && p.can_read && p.can_update && p.can_delete);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) {
        toast.error("Could not save permissions.");
        return;
      }
      toast.success("Permissions updated.");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!userId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl bg-popover border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Permissions for {username}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="py-2">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-3">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Check the actions this user can perform on each page.
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={allChecked} onCheckedChange={(c) => toggleAll(c === true)} />
                Select All
              </label>
            </div>

            <div className="mt-3">
              <PermissionsGrid permissions={permissions} onToggle={toggleCell} />
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save permissions"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
