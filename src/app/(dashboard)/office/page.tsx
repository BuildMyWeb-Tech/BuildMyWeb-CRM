"use client";

import { Building2 } from "lucide-react";
import { CompanyInfo } from "@/components/office/company-info";
import { useAuth } from "@/hooks/use-auth";

// Company Details (formerly "Office") — no tab bar anymore. Files,
// Accounts, and User Management have all moved out to their own
// top-level pages (/files, /accounts, /user-management); this page
// is Company Info and nothing else now.
export default function OfficePage() {
  const { accountId, user, canManageMembers } = useAuth();

  if (!accountId || !user) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Company Details
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Company information.
      </p>

      <CompanyInfo accountId={accountId} currentUserId={user.id} isAdmin={canManageMembers} />
    </div>
  );
}
