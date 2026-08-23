"use client";

import { useEffect, useState } from "react";
import { FileText, Table2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { DriveFile, DriveFileType } from "@/types";
import { toast } from "sonner";

// New Doc / New Sheet + the list of Docs/Sheets already created for
// this project or client, each opening in a REAL embedded Google
// editor (an iframe pointed at Google's own /edit?embedded=true URL
// — not a lookalike). Mount this alongside FileManager on a
// project/client's Files tab, not instead of it — uploaded files
// and Drive-created Docs/Sheets are two different things.

interface GoogleDriveSectionProps {
  projectId?: string | null;
  clientId?: string | null;
}

export function GoogleDriveSection({ projectId = null, clientId = null }: GoogleDriveSectionProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [creating, setCreating] = useState<DriveFileType | null>(null);
  const [namePromptType, setNamePromptType] = useState<DriveFileType | null>(null);
  const [newName, setNewName] = useState("");
  const [openFile, setOpenFile] = useState<DriveFile | null>(null);

  function load() {
    fetch("/api/google-drive/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConnected(!!d?.connected));

    const params = new URLSearchParams();
    if (projectId) params.set("project_id", projectId);
    if (clientId) params.set("client_id", clientId);
    fetch(`/api/google-drive/files?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFiles(d?.files ?? []));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, clientId]);

  function openNamePrompt(type: DriveFileType) {
    setNewName(type === "doc" ? "Untitled document" : "Untitled spreadsheet");
    setNamePromptType(type);
  }

  async function handleCreate() {
    if (!namePromptType || !newName.trim()) return;
    setCreating(namePromptType);
    try {
      const res = await fetch("/api/google-drive/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: namePromptType,
          name: newName.trim(),
          project_id: projectId,
          client_id: clientId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Could not create the file.");
        return;
      }
      setNamePromptType(null);
      load();
      if (data.file) setOpenFile(data.file);
      toast.success(`${namePromptType === "doc" ? "Document" : "Spreadsheet"} created.`);
    } finally {
      setCreating(null);
    }
  }

  function embedUrl(file: DriveFile): string {
    const kind = file.file_type === "doc" ? "document" : "spreadsheets";
    return `https://docs.google.com/${kind}/d/${file.drive_file_id}/edit?embedded=true`;
  }

  if (connected === false) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Google Drive isn&apos;t connected yet — connect it in Workspace to create Docs/Sheets here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Google Docs &amp; Sheets</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => openNamePrompt("doc")}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            New Doc
          </Button>
          <Button variant="outline" size="sm" onClick={() => openNamePrompt("sheet")}>
            <Table2 className="mr-1.5 h-3.5 w-3.5" />
            New Sheet
          </Button>
        </div>
      </div>

      {files === null ? (
        <div className="mt-4 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No Docs or Sheets yet.</p>
      ) : (
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setOpenFile(f)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
            >
              {f.file_type === "doc" ? (
                <FileText className="h-4 w-4 shrink-0 text-blue-400" />
              ) : (
                <Table2 className="h-4 w-4 shrink-0 text-emerald-400" />
              )}
              <span className="truncate text-sm text-foreground hover:underline">{f.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* New file name prompt */}
      <Dialog open={!!namePromptType} onOpenChange={(open) => !open && setNamePromptType(null)}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              New {namePromptType === "doc" ? "document" : "spreadsheet"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="border-border bg-muted text-foreground"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setNamePromptType(null)}
              className="border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!!creating || !newName.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Embedded editor — the real Google Docs/Sheets UI in an
          iframe, not a custom-built lookalike. */}
      <Dialog open={!!openFile} onOpenChange={(open) => !open && setOpenFile(null)}>
        <DialogContent className="sm:max-w-5xl bg-popover border-border max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="flex-row items-center justify-between border-b border-border p-3">
            <DialogTitle className="text-popover-foreground">{openFile?.name}</DialogTitle>
            {openFile && (
              <a
                href={openFile.web_view_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Open in new tab
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </DialogHeader>
          {openFile && (
            <iframe src={embedUrl(openFile)} className="h-[80vh] w-full" title={openFile.name} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
