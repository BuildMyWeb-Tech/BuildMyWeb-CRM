"use client";

import { AccountsTab } from "@/components/office/accounts-tab";
import { IndianRupee } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// Standalone Accounts page — moved out of Office's tab bar per
// BMW's call. Component itself (accounts-tab.tsx) still lives under
// components/office/ purely for file-organization reasons; nothing
// about it is Office-specific anymore.
export default function AccountsPage() {
  const { canManageMembers } = useAuth();

  if (!canManageMembers) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Accounts is admin-only.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <IndianRupee className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Accounts</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Client payments and revenue-split allocations.
      </p>
      <AccountsTab />
    </div>
  );
}
