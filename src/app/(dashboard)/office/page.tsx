"use client";

import Link from "next/link";
import { Building2, FileText } from "lucide-react";
import { CompanyInfo } from "@/components/office/company-info";
import { useAuth } from "@/hooks/use-auth";

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
        Company information and office tools.
      </p>

      {/* Quick links */}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/office/invoices"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors">
          <FileText className="h-4 w-4 text-primary" />
          Invoices
        </Link>
      </div>

      <div className="mt-6">
        <CompanyInfo accountId={accountId} currentUserId={user.id} isAdmin={canManageMembers} />
      </div>
    </div>
  );
}
