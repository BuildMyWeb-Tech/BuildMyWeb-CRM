"use client";

import { useState } from "react";
import { UserPlus, ShieldCheck, Eye, EyeOff, Check, ArrowLeft, Copy, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PermissionsGrid } from "@/components/user-management/permissions-grid";
import { emptyPermissionDrafts, type PagePermissionDraft } from "@/lib/permissions/page-registry";
import type { AccountRole } from "@/lib/auth/roles";
import { toast } from "sonner";

// Two-step "New User" wizard, matching the reference screenshots:
// Step 1 creates the account (username/password/status/role), Step
// 2 assigns the per-page CRUD grid. Both steps hit the API
// separately (user must exist before permissions can reference its
// user_id) but read as one flow to the person using it. Finishes
// with a copy-to-clipboard invite message, ready to paste into
// WhatsApp.

interface NewUserWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

type Step = "details" | "permissions" | "invite";

// Owner is deliberately excluded — that's a one-per-account,
// transfer-only role (see canTransferOwnership in roles.ts), not
// something to hand out via bulk user creation.
const ASSIGNABLE_ROLES: AccountRole[] = ["admin", "agent", "employee", "viewer"];

export function NewUserWizard({ open, onOpenChange, onCreated }: NewUserWizardProps) {
  const [step, setStep] = useState<Step>("details");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [role, setRole] = useState<AccountRole>("employee");
  const [creating, setCreating] = useState(false);
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [permissions, setPermissions] = useState<PagePermissionDraft[]>(emptyPermissionDrafts());
  const [saving, setSaving] = useState(false);

  function reset() {
    setStep("details");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setIsActive(true);
    setRole("employee");
    setNewUserId(null);
    setCopied(false);
    setPermissions(emptyPermissionDrafts());
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const detailsValid =
    /^[a-z0-9._-]{3,32}$/i.test(username) && password.length >= 8 && password === confirmPassword;

  async function handleCreateAccount() {
    if (!detailsValid) return;
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, is_active: isActive, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not create the account.");
        return;
      }
      setNewUserId(data.user_id);
      setStep("permissions");
    } finally {
      setCreating(false);
    }
  }

  function toggleAll(checked: boolean) {
    setPermissions((prev) =>
      prev.map((p) => ({
        ...p,
        can_create: checked,
        can_read: checked,
        can_update: checked,
        can_delete: checked,
      })),
    );
  }

  function toggleCell(pageKey: string, field: keyof Omit<PagePermissionDraft, "page_key">, checked: boolean) {
    setPermissions((prev) => prev.map((p) => (p.page_key === pageKey ? { ...p, [field]: checked } : p)));
  }

  function toggleRow(pageKey: string, checked: boolean) {
    setPermissions((prev) =>
      prev.map((p) =>
        p.page_key === pageKey ? { ...p, can_create: checked, can_read: checked, can_update: checked, can_delete: checked } : p,
      ),
    );
  }

  const allChecked = permissions.every((p) => p.can_create && p.can_read && p.can_update && p.can_delete);

  async function handleSavePermissions() {
    if (!newUserId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${newUserId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) {
        toast.error("Account created, but permissions could not be saved — set them later from the user list.");
      } else {
        toast.success("User created with permissions.");
      }
      onCreated();
      setStep("invite");
    } finally {
      setSaving(false);
    }
  }

  // Supabase Auth needs a real email under the hood, so every
  // account gets a synthetic one — see usernameToEmail() in
  // src/app/api/users/route.ts, which this mirrors for display only.
  const loginEmail = `${username.toLowerCase()}@buildmyweb.info`;
  const inviteMessage = `You're welcome to Buildmyweb company as ${role.charAt(0).toUpperCase() + role.slice(1)}!\n\nLogin: https://crm.buildmyweb.info/login\nEmail: ${loginEmail}\nUsername: ${username}\nPassword: ${password}`;

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(inviteMessage);
      setCopied(true);
      toast.success("Copied — paste it into WhatsApp.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select and copy the text manually.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl bg-popover border-border max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={step === "details" ? "text-primary" : ""}>Step 1: User Details</span>
            <span>›</span>
            <span className={step === "permissions" ? "text-primary" : ""}>Step 2: Permissions</span>
            <span>›</span>
            <span className={step === "invite" ? "text-primary" : ""}>Step 3: Invite</span>
          </div>
          <DialogTitle className="text-popover-foreground">
            {step === "details" ? "New User" : step === "permissions" ? `Assign Permissions for ${username}` : "Ready to invite"}
          </DialogTitle>
        </DialogHeader>

        {step === "details" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6 pt-2">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="h-4 w-4" />
              </div>
              <p className="text-xs text-muted-foreground">
                Create the account, then assign what it can see and do on the next step.
              </p>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">
                Username <span className="text-red-400">*</span>
              </Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. jsmith"
                className="border-border bg-muted text-foreground"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">3-32 characters — letters, numbers, dot, underscore, or hyphen.</p>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">
                Password <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-border bg-muted pr-9 text-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">
                Confirm Password <span className="text-red-400">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="border-border bg-muted pr-9 text-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-[11px] text-red-400">Passwords don&apos;t match.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Role</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as AccountRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue className="truncate capitalize">{(v: string) => v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                This is still the real permission floor — the checkbox grid on the next step can only
                restrict further, never grant beyond what this role already allows.
              </p>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">Account Status</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsActive(true)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setIsActive(false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !isActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Inactive
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
                Cancel
              </Button>
              <Button onClick={handleCreateAccount} disabled={!detailsValid || creating}>
                {creating ? "Creating…" : "Create & Set Permissions"}
              </Button>
            </div>
          </div>
        ) : step === "permissions" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Scrollable middle — only the grid scrolls, so the
                Back/Finish bar below stays reachable no matter how
                many page rows there are (previously the whole dialog
                scrolled as one block and the footer could end up
                below the fold, past a tall grid). */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-2">
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
                <PermissionsGrid permissions={permissions} onToggle={toggleCell} onToggleRow={toggleRow} />
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-border bg-popover p-4">
              <Button variant="outline" onClick={() => setStep("details")} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Button>
              <Button onClick={handleSavePermissions} disabled={saving}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {saving ? "Saving…" : "Finish"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-2">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <PartyPopper className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Account created</p>
                <p className="text-xs text-muted-foreground">
                  Send these details to {username} however you normally reach them — WhatsApp, email, whatever&apos;s easiest.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-muted p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{inviteMessage}</pre>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)} className="border-border bg-transparent text-muted-foreground hover:bg-muted">
                Close
              </Button>
              <Button onClick={handleCopyInvite}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy message"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

