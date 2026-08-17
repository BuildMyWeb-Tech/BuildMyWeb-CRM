"use client";

import { useState } from "react";
import { Building2, FileText, Folder, Users } from "lucide-react";
import { FileManager } from "@/components/files/file-manager";
import { CompanyInfo } from "@/components/office/company-info";
import { OfficeAccessTab } from "@/components/office/office-access-tab";
import { useAuth } from "@/hooks/use-auth";

type OfficeTab = "info" | "files" | "access";

// BMW Office — three sections:
//   Company Info — admin-defined custom fields (see company-info.tsx)
//   Files — the Phase 3 File Manager, Office-scoped (project_id null).
//           Bills are just PDFs here (e.g. a "Bills" folder you make
//           yourself) — no separate bills system, per BMW's call.
//   Access — admin-only: tick teammates to grant them Office viewing
export default function OfficePage() {
  const { accountId, user, canManageMembers } = useAuth();
  const [tab, setTab] = useState<OfficeTab>("info");

  if (!accountId || !user) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Office
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Company info, documents, and files.
      </p>

      <div className="mt-4 flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "info"} onClick={() => setTab("info")} icon={FileText}>
          Company Info
        </TabButton>
        <TabButton active={tab === "files"} onClick={() => setTab("files")} icon={Folder}>
          Files
        </TabButton>
        {canManageMembers && (
          <TabButton active={tab === "access"} onClick={() => setTab("access")} icon={Users}>
            Access
          </TabButton>
        )}
      </div>

      {tab === "info" && (
        <CompanyInfo accountId={accountId} currentUserId={user.id} isAdmin={canManageMembers} />
      )}
      {tab === "files" && (
        <div className="mt-4">
          <FileManager accountId={accountId} userId={user.id} projectId={null} />
        </div>
      )}
      {tab === "access" && canManageMembers && (
        <OfficeAccessTab accountId={accountId} currentUserId={user.id} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}