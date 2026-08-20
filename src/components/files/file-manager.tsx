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

// Shared Explorer/Drive-style file manager. Used both inside a
// project (projectId set) and inside Office (projectId null) —
// see 042_file_manager.sql for the scoping model. All reads/writes
// go straight through the RLS-scoped browser client (same pattern
// as task-form.tsx's attachment upload), except generating a
// public share link, which is a plain string built from
// `share_token` — the actual gate lives server-side in
// /api/files/public/[token].

interface FileManagerProps {
  accountId: string;
  userId: string;
  /** null = Office's account-wide file tree. Set = a project's own tree. */
  projectId: string | null;
  /** Set = a client's own tree (independent of projectId — pass only one). */
  clientId?: string | null;
}

interface Breadcrumb {
  id: string | null;
  name: string;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileManager({ accountId, userId, projectId, clientId = null }: FileManagerProps) {
  const supabase = createClient();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
    { id: null, name: clientId ? "Client files" : projectId ? "Project files" : "Office files" },
  ]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [renameTarget, setRenameTarget] = useState<
    { type: "folder" | "file"; id: string; name: string } | null
  >(null);
  const [renameValue, setRenameValue] = useState("");

  const [shareTarget, setShareTarget] = useState<ManagedFile | null>(null);
  // Persists per-browser, not per-account — a quick display preference,
  // not data worth round-tripping to the server.
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("file-manager-view") === "grid" ? "grid" : "list";
  });

  function changeViewMode(mode: "list" | "grid") {
    setViewMode(mode);
    window.localStorage.setItem("file-manager-view", mode);
  }

  const load = useCallback(async () => {
    setLoading(true);
    let folderQuery = supabase
      .from("file_folders")
      .select("*")
      .eq("account_id", accountId)
      .order("name", { ascending: true });
    if (clientId) {
      folderQuery = folderQuery.eq("client_id", clientId);
    } else if (projectId) {
      folderQuery = folderQuery.eq("project_id", projectId).is("client_id", null);
    } else {
      folderQuery = folderQuery.is("project_id", null).is("client_id", null);
    }
    folderQuery = currentFolderId
      ? folderQuery.eq("parent_id", currentFolderId)
      : folderQuery.is("parent_id", null);

    let fileQuery = supabase
      .from("files")
      .select("*")
      .eq("account_id", accountId)
      .order("name", { ascending: true });
    if (clientId) {
      fileQuery = fileQuery.eq("client_id", clientId);
    } else if (projectId) {
      fileQuery = fileQuery.eq("project_id", projectId).is("client_id", null);
    } else {
      fileQuery = fileQuery.is("project_id", null).is("client_id", null);
    }
    fileQuery = currentFolderId
      ? fileQuery.eq("folder_id", currentFolderId)
      : fileQuery.is("folder_id", null);

    const [foldersRes, filesRes] = await Promise.all([folderQuery, fileQuery]);
    setFolders(foldersRes.data ?? []);
    setFiles(filesRes.data ?? []);
    setLoading(false);
  }, [supabase, accountId, projectId, clientId, currentFolderId]);

  useEffect(() => {
    load();
  }, [load]);

  function openFolder(folder: FileFolder) {
    setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
  }

  function goToBreadcrumb(index: number) {
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setCurrentFolderId(breadcrumbs[index].id);
  }

  async function handleCreateFolder() {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setCreatingFolder(true);
    try {
      const { error } = await supabase.from("file_folders").insert({
        account_id: accountId,
        project_id: clientId ? null : projectId,
        client_id: clientId,
        parent_id: currentFolderId,
        name: trimmed,
        created_by: userId,
      });
      if (error) {
        toast.error("Could not create folder.");
        return;
      }
      setNewFolderOpen(false);
      setNewFolderName("");
      load();
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;

    setUploading(true);
    try {
      for (const file of selected) {
        const path = `${accountId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("files").upload(path, file);
        if (uploadError) {
          toast.error(`"${file.name}" failed to upload: ${uploadError.message}`);
          continue;
        }
        const { error: insertError } = await supabase.from("files").insert({
          account_id: accountId,
          project_id: clientId ? null : projectId,
          client_id: clientId,
          folder_id: currentFolderId,
          name: file.name,
          storage_path: path,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: userId,
        });
        if (insertError) {
          toast.error(`"${file.name}" uploaded but could not be recorded.`);
        }
      }
      load();
    } finally {
      setUploading(false);
    }
  }

  function openRename(type: "folder" | "file", id: string, name: string) {
    setRenameTarget({ type, id, name });
    setRenameValue(name);
  }

  async function handleRename() {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    const table = renameTarget.type === "folder" ? "file_folders" : "files";
    const { error } = await supabase.from(table).update({ name: trimmed }).eq("id", renameTarget.id);
    if (error) {
      toast.error("Could not rename.");
      return;
    }
    setRenameTarget(null);
    load();
  }

  async function handleDeleteFolder(folder: FileFolder) {
    // Only empty folders — avoids orphaning Storage objects that
    // Postgres's ON DELETE CASCADE would silently strand if a
    // folder full of files got cascade-deleted at the row level.
    const [{ count: subfolderCount }, { count: fileCount }] = await Promise.all([
      supabase.from("file_folders").select("id", { count: "exact", head: true }).eq("parent_id", folder.id),
      supabase.from("files").select("id", { count: "exact", head: true }).eq("folder_id", folder.id),
    ]);
    if ((subfolderCount ?? 0) > 0 || (fileCount ?? 0) > 0) {
      toast.error("This folder isn't empty — delete its contents first.");
      return;
    }
    const { error } = await supabase.from("file_folders").delete().eq("id", folder.id);
    if (error) {
      toast.error("Could not delete folder.");
      return;
    }
    load();
  }

  async function handleDeleteFile(file: ManagedFile) {
    await supabase.storage.from("files").remove([file.storage_path]);
    const { error } = await supabase.from("files").delete().eq("id", file.id);
    if (error) {
      toast.error("Could not delete file.");
      return;
    }
    load();
  }

  async function handleDownload(file: ManagedFile) {
    const { data, error } = await supabase.storage
      .from("files")
      .createSignedUrl(file.storage_path, 60, { download: file.name });
    if (error || !data) {
      toast.error("Could not generate a download link.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleTogglePublic(file: ManagedFile, next: boolean) {
    const { error } = await supabase.from("files").update({ is_public: next }).eq("id", file.id);
    if (error) {
      toast.error("Could not update sharing.");
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, is_public: next } : f)));
    setShareTarget((prev) => (prev && prev.id === file.id ? { ...prev, is_public: next } : prev));
  }

  function publicUrl(file: ManagedFile) {
    return `${window.location.origin}/api/files/public/${file.share_token}`;
  }

  async function copyPublicLink(file: ManagedFile) {
    await navigator.clipboard.writeText(publicUrl(file));
    toast.success("Link copied.");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id ?? "root"} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <button
                type="button"
                onClick={() => goToBreadcrumb(i)}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted ${
                  i === breadcrumbs.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {i === 0 && <Home className="h-3.5 w-3.5" />}
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
            New folder
          </Button>
          <label
            className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-all hover:bg-muted ${
              uploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? "Uploading…" : "Upload"}
            <input type="file" multiple className="hidden" disabled={uploading} onChange={handleUpload} />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">This folder is empty.</p>
        </div>
      ) : viewMode === "list" ? (
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
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
                <span className="truncate text-sm text-foreground">{folder.name}</span>
              </button>
              <FolderActionsMenu
                onRename={() => openRename("folder", folder.id, folder.name)}
                onDelete={() => handleDeleteFolder(folder)}
              />
            </div>
          ))}

          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
              <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.file_size)}</p>
              </div>
              {file.is_public && (
                <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Publicly shared" />
              )}
              <FileActionsMenu
                onDownload={() => handleDownload(file)}
                onShare={() => setShareTarget(file)}
                onRename={() => openRename("file", file.id, file.name)}
                onDelete={() => handleDeleteFile(file)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                <span className="line-clamp-2 text-xs text-foreground">{folder.name}</span>
              </button>
              <div className="absolute right-1.5 top-1.5">
                <FolderActionsMenu
                  onRename={() => openRename("folder", folder.id, folder.name)}
                  onDelete={() => handleDeleteFolder(folder)}
                />
              </div>
            </div>
          ))}

          {files.map((file) => (
            <div
              key={file.id}
              className="group relative flex flex-col items-center gap-2 rounded-xl border border-border p-4 hover:bg-muted/50"
            >
              <FileIcon className="h-9 w-9 text-muted-foreground" />
              <span className="line-clamp-2 text-center text-xs text-foreground">{file.name}</span>
              <span className="text-[10px] text-muted-foreground">{formatBytes(file.file_size)}</span>
              {file.is_public && (
                <Globe
                  className="absolute left-1.5 top-1.5 h-3.5 w-3.5 text-emerald-500"
                  aria-label="Publicly shared"
                />
              )}
              <div className="absolute right-1.5 top-1.5">
                <FileActionsMenu
                  onDownload={() => handleDownload(file)}
                  onShare={() => setShareTarget(file)}
                  onRename={() => openRename("file", file.id, file.name)}
                  onDelete={() => handleDeleteFile(file)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">New folder</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="border-border bg-muted text-foreground"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
            }}
          />
          <DialogFooter className="border-border bg-popover/50">
            <Button
              variant="outline"
              onClick={() => setNewFolderOpen(false)}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Rename {renameTarget?.type}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="border-border bg-muted text-foreground"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
          />
          <DialogFooter className="border-border bg-popover/50">
            <Button
              variant="outline"
              onClick={() => setRenameTarget(null)}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={!!shareTarget} onOpenChange={(open) => !open && setShareTarget(null)}>
        <DialogContent className="sm:max-w-md bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Share &quot;{shareTarget?.name}&quot;</DialogTitle>
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
                    {shareTarget?.is_public ? "Anyone with the link" : "Private"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {shareTarget?.is_public
                      ? "This file can be downloaded without logging in."
                      : "Only your team can access this file."}
                  </p>
                </div>
              </div>
              <Button
                variant={shareTarget?.is_public ? "outline" : "default"}
                size="sm"
                onClick={() => shareTarget && handleTogglePublic(shareTarget, !shareTarget.is_public)}
              >
                {shareTarget?.is_public ? "Make private" : "Make public"}
              </Button>
            </div>

            {shareTarget?.is_public && (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareTarget ? publicUrl(shareTarget) : ""}
                  className="border-border bg-muted text-xs text-foreground"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shareTarget && copyPublicLink(shareTarget)}
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

// Shared between the list and grid layouts so the two views can't
// drift out of sync with each other on what actions a folder/file
// offers.
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
        <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
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
        <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
