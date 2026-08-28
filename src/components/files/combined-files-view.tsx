"use client";

import { useState } from "react";
import { List as ListIcon, LayoutGrid } from "lucide-react";
import { FileManager } from "@/components/files/file-manager";
import { GoogleDriveSection } from "@/components/google-drive/google-drive-section";

// Combines Google Docs/Sheets and uploaded Client/Project files
// under one shared grid/list toggle and one page section, instead
// of two visually separate stacked blocks. The two are still
// technically separate components underneath (different data
// sources — drive_files vs files/file_folders — and Drive items
// don't live inside folders the way uploads do), but this is the
// unified surface: one toggle controls both, all the action buttons
// (New Doc, New Sheet, New folder, Upload) are visible together.

interface CombinedFilesViewProps {
  accountId: string;
  userId: string;
  projectId?: string | null;
  clientId?: string | null;
}

export function CombinedFilesView({ accountId, userId, projectId = null, clientId = null }: CombinedFilesViewProps) {
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("combined-files-view") === "grid" ? "grid" : "list";
  });

  function changeViewMode(mode: "list" | "grid") {
    setViewMode(mode);
    window.localStorage.setItem("combined-files-view", mode);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Files</p>
        <div className="flex items-center rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => changeViewMode("list")}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            className={`flex h-6 w-7 items-center justify-center rounded-md ${
              viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("grid")}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
            className={`flex h-6 w-7 items-center justify-center rounded-md ${
              viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <GoogleDriveSection projectId={projectId} clientId={clientId} viewMode={viewMode} hideHeader />

      <div className="border-t border-border pt-4">
        <FileManager
          accountId={accountId}
          userId={userId}
          projectId={projectId}
          clientId={clientId}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          hideViewToggle
        />
      </div>
    </div>
  );
}
