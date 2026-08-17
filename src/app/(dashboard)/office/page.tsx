"use client";

import { Building2 } from "lucide-react";
import { FileManager } from "@/components/files/file-manager";
import { useAuth } from "@/hooks/use-auth";

// BMW Office — file manager ships in Phase 3. Company info and
// bills (with the per-person access checkbox) land in Phase 4 as
// additional sections on this same page.
export default function OfficePage() {
  const { accountId, user } = useAuth();

  return (
    <div>
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Office
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Company documents and files. Company info and bills are coming in
        the next phase.
      </p>

      <div className="mt-6">
        {accountId && user ? (
          <FileManager accountId={accountId} userId={user.id} projectId={null} />
        ) : null}
      </div>
    </div>
  );
}