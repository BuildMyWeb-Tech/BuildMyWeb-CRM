"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AccountMember, OfficeAccess as OfficeAccessRow } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

// Admin-only tab: tick a teammate to grant them Office access
// (company info + the Office file tree, view-only — see
// 043_bmw_office.sql for exactly what the checkbox does and
// doesn't grant). Admins/owner always have access and aren't
// shown a checkbox for it, since it can't be revoked.

interface OfficeAccessTabProps {
  accountId: string;
  currentUserId: string;
}

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function OfficeAccessTab({ accountId, currentUserId }: OfficeAccessTabProps) {
  const supabase = createClient();
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [grants, setGrants] = useState<OfficeAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [membersRes, grantsRes] = await Promise.all([
      fetch("/api/account/members").then((r) => (r.ok ? r.json() : { members: [] })),
      supabase.from("office_access").select("*").eq("account_id", accountId),
    ]);
    setMembers(membersRes.members ?? []);
    setGrants(grantsRes.data ?? []);
    setLoading(false);
  }, [supabase, accountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleAccess(userId: string, next: boolean) {
    setSavingUserId(userId);
    try {
      if (next) {
        const { data, error } = await supabase
          .from("office_access")
          .insert({ account_id: accountId, user_id: userId, granted_by: currentUserId })
          .select()
          .single();
        if (error || !data) {
          toast.error("Could not grant access.");
          return;
        }
        setGrants((prev) => [...prev, data]);
      } else {
        const { error } = await supabase
          .from("office_access")
          .delete()
          .eq("account_id", accountId)
          .eq("user_id", userId);
        if (error) {
          toast.error("Could not revoke access.");
          return;
        }
        setGrants((prev) => prev.filter((g) => g.user_id !== userId));
      }
    } finally {
      setSavingUserId(null);
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
    <div className="mt-4">
      <p className="text-sm text-muted-foreground">
        Owners and admins always have Office access. Tick a teammate below to
        let them view Office too (company info + files) — this grants
        viewing, not editing.
      </p>
      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {members.map((m) => {
          const isAdminOrOwner = m.role === "admin" || m.role === "owner";
          const hasGrant = grants.some((g) => g.user_id === m.user_id);
          return (
            <div key={m.user_id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                  {initials(m.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{m.full_name}</p>
                <p className="text-xs capitalize text-muted-foreground">{m.role}</p>
              </div>
              {isAdminOrOwner ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Always has access
                </span>
              ) : savingUserId === m.user_id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Checkbox
                  checked={hasGrant}
                  onCheckedChange={(checked) => toggleAccess(m.user_id, checked === true)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}