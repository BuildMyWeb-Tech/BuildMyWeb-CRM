"use client";

import { useCallback, useEffect, useState } from "react";
import { Users2, Plus, Loader2, ShieldCheck, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NewUserWizard } from "@/components/user-management/new-user-wizard";
import { EditPermissionsDialog } from "@/components/user-management/edit-permissions-dialog";
import type { LocalUser } from "@/types";
import { toast } from "sonner";

// Office → User Management. Local username/password accounts,
// separate from the existing Team Members invite flow (Workspace →
// Team Members, real-email based) — this is specifically for the
// "create a login for someone directly" pattern from the reference
// screenshots, with its own per-page permission grid.
export default function UserManagementPage() {
  const [users, setUsers] = useState<LocalUser[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<LocalUser | null>(null);
  const [permissionsTarget, setPermissionsTarget] = useState<LocalUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUsers(d?.users ?? []))
      .catch((err) => console.error("[user-management] load failed:", err));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(user: LocalUser) {
    const res = await fetch(`/api/users/${user.user_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    if (!res.ok) {
      toast.error("Could not update status.");
      return;
    }
    load();
  }

  async function handleResetPassword() {
    if (!resetTarget || newPassword.length < 8) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${resetTarget.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        toast.error("Could not reset password.");
        return;
      }
      toast.success("Password updated.");
      setResetTarget(null);
      setNewPassword("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: LocalUser) {
    if (!window.confirm(`Delete the account "${user.username}"? This can't be undone.`)) return;
    const res = await fetch(`/api/users/${user.user_id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete account.");
      return;
    }
    load();
    toast.success("Account deleted.");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">User Management</h1>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New User
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Local username/password logins with per-page permissions — separate from Workspace → Team
        Members, which invites people by real email instead.
      </p>

      {users === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No local users yet.</p>
          <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create the first one
          </Button>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-border rounded-lg border border-border">
          {users.map((u) => (
            <div key={u.user_id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{u.username}</p>
                <p className="text-xs capitalize text-muted-foreground">{u.role}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(u)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  u.is_active ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
                }`}
              >
                {u.is_active ? "Active" : "Inactive"}
              </button>
              <Button variant="ghost" size="icon-xs" onClick={() => setResetTarget(u)} title="Reset password" className="text-muted-foreground hover:text-foreground">
                <KeyRound className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => setPermissionsTarget(u)} title="Permissions" className="text-muted-foreground hover:text-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(u)} className="text-muted-foreground hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <NewUserWizard open={wizardOpen} onOpenChange={setWizardOpen} onCreated={load} />

      {permissionsTarget && (
        <EditPermissionsDialog
          userId={permissionsTarget.user_id}
          username={permissionsTarget.username}
          onClose={() => setPermissionsTarget(null)}
        />
      )}

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Reset password for {resetTarget?.username}</DialogTitle>
          </DialogHeader>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="border-border bg-muted text-foreground"
          />
          <DialogFooter className="border-border bg-popover/50">
            <Button variant="outline" onClick={() => setResetTarget(null)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={saving || newPassword.length < 8}>
              {saving ? "Saving…" : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
