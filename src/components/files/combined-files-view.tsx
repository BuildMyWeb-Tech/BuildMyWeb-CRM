"use client";

import { useRef, useState } from "react";
import { FileText, FolderPlus, List as ListIcon, LayoutGrid, Plus, Table2, Upload } from "lucide-react";
import { FileManager, type FileManagerHandle } from "@/components/files/file-manager";
import { GoogleDriveSection, type GoogleDriveSectionHandle } from "@/components/google-drive/google-drive-section";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Combines Google Docs/Sheets and uploaded Client/Project files
// under one shared grid/list toggle and one unified "New" button,
// instead of two visually separate stacked blocks each with their
// own action buttons. The two are still technically separate
// components underneath (different data sources — drive_files vs
// files/file_folders — and Drive items don't live inside folders the
// way uploads do), but each exposes an imperative ref so this
// wrapper can drive "New Doc" / "New Sheet" / "New folder" / "Upload"
// from one dropdown instead of four scattered buttons.

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

  const driveRef = useRef<GoogleDriveSectionHandle>(null);
  const filesRef = useRef<FileManagerHandle>(null);

  function changeViewMode(mode: "list" | "grid") {
    setViewMode(mode);
    window.localStorage.setItem("combined-files-view", mode);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Files</p>
        <div className="flex items-center gap-2">
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

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => driveRef.current?.openNewDoc()}>
                <FileText className="h-3.5 w-3.5" />
                Google Doc
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => driveRef.current?.openNewSheet()}>
                <Table2 className="h-3.5 w-3.5" />
                Google Sheet
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => filesRef.current?.openNewFolder()}>
                <FolderPlus className="h-3.5 w-3.5" />
                Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => filesRef.current?.triggerUpload()}>
                <Upload className="h-3.5 w-3.5" />
                Upload file
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <GoogleDriveSection ref={driveRef} projectId={projectId} clientId={clientId} viewMode={viewMode} hideHeader hideActions />

      <div className="border-t border-border pt-4">
        <FileManager
          ref={filesRef}
          accountId={accountId}
          userId={userId}
          projectId={projectId}
          clientId={clientId}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          hideViewToggle
          hideActionButtons
        />
      </div>
    </div>
  );
}
