"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FileFolder, ManagedFile } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Folder,
  File as FileIcon,
  FolderPlus,
  Upload,
  MoreVertical,
  Pencil,
  Trash2,
  Link2,
  Globe,
  Lock,
  Download,
  ChevronRight,
  Home,
  Loader2,
  List as ListIcon,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";

interface FileManagerProps {
  accountId: string;
  userId: string;
  /** null = Office's account-wide file tree. Set = a project's own tree. */
  projectId: string | null;
}

interface Breadcrumb {
  id: string | null;
  name: string;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileManager({
  accountId,
  userId,
  projectId,
}: FileManagerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
    {
      id: null,
      name: projectId ? "Project files" : "Office files",
    },
  ]);

  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // New folder
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Rename
  const [renameTarget, setRenameTarget] = useState<{
    type: "folder" | "file";
    id: string;
    name: string;
  } | null>(null);

  const [renameValue, setRenameValue] = useState("");

  // Share
  const [shareTarget, setShareTarget] = useState<ManagedFile | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") {
      return "list";
    }

    return window.localStorage.getItem("file-manager-view") === "grid"
      ? "grid"
      : "list";
  });

  const changeViewMode = useCallback((mode: "list" | "grid") => {
    setViewMode(mode);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("file-manager-view", mode);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    const supabase = createClient();

    let folderQuery = supabase
      .from("file_folders")
      .select("*")
      .eq("account_id", accountId)
      .order("name", { ascending: true });

    if (projectId) {
      folderQuery = folderQuery.eq("project_id", projectId);
    } else {
      folderQuery = folderQuery.is("project_id", null);
    }

    if (currentFolderId) {
      folderQuery = folderQuery.eq("parent_id", currentFolderId);
    } else {
      folderQuery = folderQuery.is("parent_id", null);
    }

    let fileQuery = supabase
      .from("files")
      .select("*")
      .eq("account_id", accountId)
      .order("name", { ascending: true });

    if (projectId) {
      fileQuery = fileQuery.eq("project_id", projectId);
    } else {
      fileQuery = fileQuery.is("project_id", null);
    }

    if (currentFolderId) {
      fileQuery = fileQuery.eq("folder_id", currentFolderId);
    } else {
      fileQuery = fileQuery.is("folder_id", null);
    }

    const [foldersRes, filesRes] = await Promise.all([
      folderQuery,
      fileQuery,
    ]);

    if (foldersRes.error) {
      console.error("Failed to load folders:", foldersRes.error);
      toast.error("Could not load folders.");
    }

    if (filesRes.error) {
      console.error("Failed to load files:", filesRes.error);
      toast.error("Could not load files.");
    }

    setFolders(foldersRes.data ?? []);
    setFiles(filesRes.data ?? []);
    setLoading(false);
  }, [accountId, projectId, currentFolderId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openFolder(folder: FileFolder) {
    setBreadcrumbs((prev) => [
      ...prev,
      {
        id: folder.id,
        name: folder.name,
      },
    ]);

    setCurrentFolderId(folder.id);
  }

  function goToBreadcrumb(index: number) {
    const target = breadcrumbs[index];

    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setCurrentFolderId(target.id);
  }

  async function handleCreateFolder() {
    const trimmed = newFolderName.trim();

    if (!trimmed) {
      return;
    }

    setCreatingFolder(true);

    try {
      const supabase = createClient();

      const { error } = await supabase.from("file_folders").insert({
        account_id: accountId,
        project_id: projectId,
        parent_id: currentFolderId,
        name: trimmed,
        created_by: userId,
      });

      if (error) {
        console.error("Create folder error:", error);
        toast.error("Could not create folder.");
        return;
      }

      setNewFolderOpen(false);
      setNewFolderName("");

      await load();

      toast.success("Folder created.");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const selected = Array.from(e.target.files ?? []);

    e.target.value = "";

    if (selected.length === 0) {
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();

      for (const file of selected) {
        const path = `${accountId}/${crypto.randomUUID()}-${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("files")
          .upload(path, file);

        if (uploadError) {
          console.error("Upload error:", uploadError);

          toast.error(
            `"${file.name}" failed to upload: ${uploadError.message}`,
          );

          continue;
        }

        const { error: insertError } = await supabase
          .from("files")
          .insert({
            account_id: accountId,
            project_id: projectId,
            folder_id: currentFolderId,
            name: file.name,
            storage_path: path,
            file_size: file.size,
            mime_type: file.type || null,
            uploaded_by: userId,
          });

        if (insertError) {
          console.error("File record error:", insertError);

          toast.error(
            `"${file.name}" uploaded but could not be recorded.`,
          );
        }
      }

      await load();
    } finally {
      setUploading(false);
    }
  }

  function openRename(
    type: "folder" | "file",
    id: string,
    name: string,
  ) {
    setRenameTarget({
      type,
      id,
      name,
    });

    setRenameValue(name);
  }

  async function handleRename() {
    if (!renameTarget) {
      return;
    }

    const trimmed = renameValue.trim();

    if (!trimmed) {
      return;
    }

    const supabase = createClient();

    const table =
      renameTarget.type === "folder"
        ? "file_folders"
        : "files";

    const { error } = await supabase
      .from(table)
      .update({
        name: trimmed,
      })
      .eq("id", renameTarget.id);

    if (error) {
      console.error("Rename error:", error);
      toast.error("Could not rename.");
      return;
    }

    setRenameTarget(null);
    setRenameValue("");

    await load();

    toast.success("Renamed successfully.");
  }

  async function handleDeleteFolder(folder: FileFolder) {
    const supabase = createClient();

    const [{ count: subfolderCount }, { count: fileCount }] =
      await Promise.all([
        supabase
          .from("file_folders")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("parent_id", folder.id),

        supabase
          .from("files")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("folder_id", folder.id),
      ]);

    if (
      (subfolderCount ?? 0) > 0 ||
      (fileCount ?? 0) > 0
    ) {
      toast.error(
        "This folder isn't empty — delete its contents first.",
      );

      return;
    }

    const { error } = await supabase
      .from("file_folders")
      .delete()
      .eq("id", folder.id);

    if (error) {
      console.error("Delete folder error:", error);
      toast.error("Could not delete folder.");
      return;
    }

    await load();

    toast.success("Folder deleted.");
  }

  async function handleDeleteFile(file: ManagedFile) {
    const supabase = createClient();

    const { error: storageError } = await supabase.storage
      .from("files")
      .remove([file.storage_path]);

    if (storageError) {
      console.error(
        "Storage delete error:",
        storageError,
      );
    }

    const { error } = await supabase
      .from("files")
      .delete()
      .eq("id", file.id);

    if (error) {
      console.error("Delete file error:", error);
      toast.error("Could not delete file.");
      return;
    }

    await load();

    toast.success("File deleted.");
  }

  async function handleDownload(file: ManagedFile) {
    const supabase = createClient();

    const { data, error } = await supabase.storage
      .from("files")
      .createSignedUrl(file.storage_path, 60, {
        download: file.name,
      });

    if (error || !data) {
      console.error("Download URL error:", error);
      toast.error("Could not generate a download link.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function handleTogglePublic(
    file: ManagedFile,
    next: boolean,
  ) {
    const supabase = createClient();

    const { error } = await supabase
      .from("files")
      .update({
        is_public: next,
      })
      .eq("id", file.id);

    if (error) {
      console.error("Sharing update error:", error);
      toast.error("Could not update sharing.");
      return;
    }

    setFiles((prev) =>
      prev.map((item) =>
        item.id === file.id
          ? {
              ...item,
              is_public: next,
            }
          : item,
      ),
    );

    setShareTarget((prev) =>
      prev && prev.id === file.id
        ? {
            ...prev,
            is_public: next,
          }
        : prev,
    );

    toast.success(next ? "File is now public." : "File is now private.");
  }

  function publicUrl(file: ManagedFile) {
    return `${window.location.origin}/api/files/public/${file.share_token}`;
  }

  async function copyPublicLink(file: ManagedFile) {
    try {
      await navigator.clipboard.writeText(publicUrl(file));
      toast.success("Link copied.");
    } catch {
      toast.error("Could not copy link.");
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        {/* Breadcrumbs */}
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <span
              key={crumb.id ?? "root"}
              className="flex items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}

              <button
                type="button"
                onClick={() => goToBreadcrumb(index)}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted ${
                  index === breadcrumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {index === 0 && (
                  <Home className="h-3.5 w-3.5" />
                )}

                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* View switcher */}
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => changeViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`flex h-6 w-7 items-center justify-center rounded-md ${
                viewMode === "list"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
                viewMode === "grid"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* New folder */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
            New folder
          </Button>

          {/* Upload */}
          <label
            className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-all hover:bg-muted ${
              uploading
                ? "pointer-events-none opacity-50"
                : ""
            }`}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}

            {uploading ? "Uploading…" : "Upload"}

            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-14 text-center">
          <Folder className="mb-2 h-8 w-8 text-muted-foreground" />

          <p className="text-sm text-muted-foreground">
            This folder is empty.
          </p>
        </div>
      ) : viewMode === "list" ? (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {/* Folders */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
            >
              <button
                type="button"
                onClick={() => openFolder(folder)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <Folder className="h-4 w-4 shrink-0 text-primary" />

                <span className="truncate text-sm text-foreground">
                  {folder.name}
                </span>
              </button>

              <FolderActionsMenu
                onRename={() =>
                  openRename(
                    "folder",
                    folder.id,
                    folder.name,
                  )
                }
                onDelete={() =>
                  handleDeleteFolder(folder)
                }
              />
            </div>
          ))}

          {/* Files */}
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
            >
              <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {file.name}
                </p>

                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.file_size)}
                </p>
              </div>

              {file.is_public && (
                <Globe
                  className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                  aria-label="Publicly shared"
                />
              )}

              <FileActionsMenu
                onDownload={() =>
                  handleDownload(file)
                }
                onShare={() =>
                  setShareTarget(file)
                }
                onRename={() =>
                  openRename(
                    "file",
                    file.id,
                    file.name,
                  )
                }
                onDelete={() =>
                  handleDeleteFile(file)
                }
              />
            </div>
          ))}
        </div>
      ) : (
        /* Grid */
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {/* Folders */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="group relative flex flex-col items-center gap-2 rounded-xl border border-border p-4 hover:bg-muted/50"
            >
              <button
                type="button"
                onClick={() => openFolder(folder)}
                className="flex flex-1 flex-col items-center gap-2 text-center"
              >
                <Folder className="h-9 w-9 text-primary" />

                <span className="line-clamp-2 text-xs text-foreground">
                  {folder.name}
                </span>
              </button>

              <div className="absolute right-1.5 top-1.5">
                <FolderActionsMenu
                  onRename={() =>
                    openRename(
                      "folder",
                      folder.id,
                      folder.name,
                    )
                  }
                  onDelete={() =>
                    handleDeleteFolder(folder)
                  }
                />
              </div>
            </div>
          ))}

          {/* Files */}
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative flex flex-col items-center gap-2 rounded-xl border border-border p-4 hover:bg-muted/50"
            >
              <FileIcon className="h-9 w-9 text-muted-foreground" />

              <span className="line-clamp-2 text-center text-xs text-foreground">
                {file.name}
              </span>

              <span className="text-[10px] text-muted-foreground">
                {formatBytes(file.file_size)}
              </span>

              {file.is_public && (
                <Globe
                  className="absolute left-1.5 top-1.5 h-3.5 w-3.5 text-emerald-500"
                  aria-label="Publicly shared"
                />
              )}

              <div className="absolute right-1.5 top-1.5">
                <FileActionsMenu
                  onDownload={() =>
                    handleDownload(file)
                  }
                  onShare={() =>
                    setShareTarget(file)
                  }
                  onRename={() =>
                    openRename(
                      "file",
                      file.id,
                      file.name,
                    )
                  }
                  onDelete={() =>
                    handleDeleteFile(file)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
      >
        <DialogContent className="border-border bg-popover sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              New folder
            </DialogTitle>
          </DialogHeader>

          <Input
            value={newFolderName}
            onChange={(e) =>
              setNewFolderName(e.target.value)
            }
            placeholder="Folder name"
            className="border-border bg-muted text-foreground"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleCreateFolder();
              }
            }}
          />

          <DialogFooter className="border-border bg-popover/50">
            <Button
              variant="outline"
              onClick={() => {
                setNewFolderOpen(false);
                setNewFolderName("");
              }}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>

            <Button
              onClick={() => void handleCreateFolder()}
              disabled={
                creatingFolder ||
                !newFolderName.trim()
              }
            >
              {creatingFolder
                ? "Creating…"
                : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent className="border-border bg-popover sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Rename {renameTarget?.type}
            </DialogTitle>
          </DialogHeader>

          <Input
            value={renameValue}
            onChange={(e) =>
              setRenameValue(e.target.value)
            }
            className="border-border bg-muted text-foreground"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleRename();
              }
            }}
          />

          <DialogFooter className="border-border bg-popover/50">
            <Button
              variant="outline"
              onClick={() => {
                setRenameTarget(null);
                setRenameValue("");
              }}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>

            <Button
              onClick={() => void handleRename()}
              disabled={!renameValue.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog
        open={!!shareTarget}
        onOpenChange={(open) => {
          if (!open) {
            setShareTarget(null);
          }
        }}
      >
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Share &quot;{shareTarget?.name}&quot;
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted p-3">
              <div className="flex items-center gap-2">
                {shareTarget?.is_public ? (
                  <Globe className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                )}

                <div>
                  <p className="text-sm font-medium text-foreground">
                    {shareTarget?.is_public
                      ? "Anyone with the link"
                      : "Private"}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {shareTarget?.is_public
                      ? "This file can be downloaded without logging in."
                      : "Only your team can access this file."}
                  </p>
                </div>
              </div>

              <Button
                variant={
                  shareTarget?.is_public
                    ? "outline"
                    : "default"
                }
                size="sm"
                onClick={() => {
                  if (shareTarget) {
                    void handleTogglePublic(
                      shareTarget,
                      !shareTarget.is_public,
                    );
                  }
                }}
              >
                {shareTarget?.is_public
                  ? "Make private"
                  : "Make public"}
              </Button>
            </div>

            {shareTarget?.is_public && (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={
                    shareTarget
                      ? publicUrl(shareTarget)
                      : ""
                  }
                  className="border-border bg-muted text-xs text-foreground"
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (shareTarget) {
                      void copyPublicLink(
                        shareTarget,
                      );
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="border-border bg-popover/50">
            <Button
              variant="outline"
              onClick={() => setShareTarget(null)}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FolderActionsMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onDelete}
          className="text-red-400 focus:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FileActionsMenu({
  onDownload,
  onShare,
  onRename,
  onDelete,
}: {
  onDownload: () => void;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDownload}>
          <Download className="h-3.5 w-3.5" />
          Download
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onShare}>
          <Link2 className="h-3.5 w-3.5" />
          Share
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onRename}>
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onDelete}
          className="text-red-400 focus:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}