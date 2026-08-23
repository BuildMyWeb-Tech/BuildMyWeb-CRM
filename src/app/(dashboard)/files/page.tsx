"use client";

import { Folder } from "lucide-react";
import { FileManager } from "@/components/files/file-manager";
import { useAuth } from "@/hooks/use-auth";

// Standalone Files page — moved out of Office's tab bar per BMW's
// call, same as Accounts and User Management before it: no tabs
// left in Office at all now, each section is its own top-level page.
export default function FilesPage() {
  const { accountId, user } = useAuth();

  if (!accountId || !user) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Folder className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Files</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Shared company documents.
      </p>
      <div className="mt-4">
        <FileManager accountId={accountId} userId={user.id} projectId={null} />
      </div>
    </div>
  );
}
