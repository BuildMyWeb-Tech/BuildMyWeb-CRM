"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProjectChat } from "@/components/projects/project-chat";
import { useAuth } from "@/hooks/use-auth";
import type { Project, AccountMember } from "@/types";

// Project Chat Hub — sidebar lists all projects, clicking one opens
// that project's chat in the main pane without navigating away.

export default function ProjectChatHubPage() {
  const { accountId, user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Project[] = d?.projects ?? [];
        setProjects(list);
        if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
      });
    fetch("/api/account/members")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMembers(d?.members ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = (projects ?? []).filter((p) =>
    search.trim() === "" ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const selected = (projects ?? []).find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-border bg-card">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Project Chats</span>
        </div>
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="h-8 border-border bg-muted pl-8 text-xs text-foreground"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-none">
          {projects === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">No projects found.</p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors ${
                  selectedId === p.id ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <span className={`text-sm font-medium leading-snug ${selectedId === p.id ? "text-primary" : "text-foreground"}`}>
                  {p.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.contact?.name || p.client_name}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Main chat pane ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected || !accountId || !user ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            {projects === null ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select a project to open its chat.</p>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{selected.name}</p>
              <p className="text-xs text-muted-foreground">{selected.contact?.name || selected.client_name || "No client"}</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProjectChat
                projectId={selected.id}
                accountId={accountId}
                currentUserId={user.id}
                members={members}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
