"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, Pin, Send, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AccountMember, ProjectChatMessage } from "@/types";
import { toast } from "sonner";

export function ProjectChat({
  projectId,
  accountId,
  currentUserId,
  members,
}: {
  projectId: string;
  accountId: string;
  currentUserId: string;
  members: AccountMember[];
}) {
  const [messages, setMessages] = useState<ProjectChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const membersById = new Map(members.map((m) => [m.user_id, m]));

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("project_chat_messages")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setMessages((data ?? []) as ProjectChatMessage[]);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project-chat:${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as ProjectChatMessage;
          setMessages((prev) => {
            if (!prev) return [row];
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as ProjectChatMessage;
          setMessages((prev) => prev?.map((m) => m.id === row.id ? row : m) ?? prev);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const oldRow = payload.old as Partial<ProjectChatMessage>;
          setMessages((prev) => prev?.filter((m) => m.id !== oldRow.id) ?? prev);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const tempId = crypto.randomUUID();
    const optimistic: ProjectChatMessage = {
      id: tempId,
      account_id: accountId,
      project_id: projectId,
      sender_user_id: currentUserId,
      body,
      is_note: isNote,
      created_at: new Date().toISOString(),
    } as ProjectChatMessage;
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setDraft("");
    setMentionQuery(null);
    const noteVal = isNote;
    setIsNote(false);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("project_chat_messages").insert({
        account_id: accountId,
        project_id: projectId,
        sender_user_id: currentUserId,
        body,
        is_note: noteVal,
      }).select("*").single();
      if (error) {
        toast.error("Could not send message.");
        setMessages((prev) => prev?.filter((m) => m.id !== tempId) ?? null);
        return;
      }
      // Replace optimistic with real row
      if (data) {
        setMessages((prev) => prev?.map((m) => m.id === tempId ? (data as ProjectChatMessage) : m) ?? prev);
      }
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("project_chat_messages").delete().eq("id", id);
    if (error) toast.error("Could not delete message.");
  }

  async function saveEdit(id: string) {
    const body = editBody.trim();
    if (!body) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("project_chat_messages")
      .update({ body })
      .eq("id", id);
    if (error) { toast.error("Could not update message."); return; }
    setMessages((prev) => prev?.map((m) => m.id === id ? { ...m, body } : m) ?? prev);
    setEditingId(null);
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setDraft(val);
    const atIdx = val.lastIndexOf("@");
    if (atIdx !== -1) {
      const after = val.slice(atIdx + 1);
      if (!after.includes(" ")) { setMentionQuery(after); return; }
    }
    setMentionQuery(null);
  }

  function insertMention(name: string) {
    const atIdx = draft.lastIndexOf("@");
    if (atIdx !== -1) setDraft(draft.slice(0, atIdx) + "@" + name + " ");
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  const mentionMembers = mentionQuery !== null
    ? members.filter((m) => (m.full_name ?? "").toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  return (
    <div className="flex h-[60vh] flex-col rounded-lg border border-border">
      <div className="flex-1 overflow-y-auto p-4">
        {messages === null ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm text-muted-foreground">No messages yet — say hello to the team.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              const isMe = m.sender_user_id === currentUserId;
              const sender = m.sender_user_id ? membersById.get(m.sender_user_id) : null;
              const isEditing = editingId === m.id;

              if (m.is_note) {
                return (
                  <div key={m.id} className="group mx-auto w-full max-w-[90%]">
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50/80 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-950/30">
                      <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            Internal Note — {sender?.full_name ?? "Unknown"}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              autoFocus
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveEdit(m.id); }
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              className="flex-1 rounded border border-amber-400/50 bg-transparent px-2 py-0.5 text-sm text-amber-900 dark:text-amber-100 focus:outline-none"
                            />
                            <button type="button" onClick={() => saveEdit(m.id)} className="text-green-500 hover:text-green-400"><Check className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <p className="text-sm text-amber-900 dark:text-amber-100 break-words">{m.body}</p>
                        )}
                      </div>
                      {isMe && !isEditing && (
                        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => { setEditingId(m.id); setEditBody(m.body); }} aria-label="Edit" className="text-muted-foreground hover:text-amber-400">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => remove(m.id)} aria-label="Delete" className="text-muted-foreground hover:text-red-400">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className={`group flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    {!isMe && <span className="text-[10px] font-medium text-muted-foreground">{sender?.full_name ?? "Unknown"}</span>}
                    <div className="flex items-center gap-1">
                      {isMe && !isEditing && (
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button type="button" onClick={() => { setEditingId(m.id); setEditBody(m.body); }} aria-label="Edit" className="text-muted-foreground hover:text-blue-400">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => remove(m.id)} aria-label="Delete" className="text-muted-foreground hover:text-red-400">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveEdit(m.id); }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="rounded-lg border border-primary/50 bg-muted px-3 py-1.5 text-sm text-foreground focus:outline-none w-48"
                          />
                          <button type="button" onClick={() => saveEdit(m.id)} className="text-green-500 hover:text-green-400"><Check className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <div className={`rounded-lg px-3 py-1.5 text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                          {m.body}
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        {isNote && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
            <Pin className="h-3 w-3" />
            Internal note — only visible to team members
          </div>
        )}
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNote((v) => !v)}
            title={isNote ? "Switch to message" : "Add internal note"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ${
              isNote
                ? "border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                : "border-border bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Pin className="h-4 w-4" />
          </button>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setMentionQuery(null); return; }
                if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={isNote ? "Add an internal note…" : "Message the project team… (@ to mention)"}
              className="h-9 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground focus:outline-none"
            />
            {mentionMembers.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-52 rounded-lg border border-border bg-card shadow-xl z-50">
                {mentionMembers.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertMention(m.full_name ?? ""); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {(m.full_name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-foreground">{m.full_name}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground capitalize">{m.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={send}
            disabled={sending || !draft.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
