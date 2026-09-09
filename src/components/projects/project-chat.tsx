"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AccountMember, ProjectChatMessage } from "@/types";
import { toast } from "sonner";

// One chat "group" per project — project_id is the group key, no
// separate groups table (same reasoning file_folders/files use
// project_id directly). Two effects, fetch vs. realtime-subscribe,
// same convention as src/components/inbox/message-thread.tsx.

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
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
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
    return () => {
      cancelled = true;
    };
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
        { event: "DELETE", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const oldRow = payload.old as Partial<ProjectChatMessage>;
          setMessages((prev) => prev?.filter((m) => m.id !== oldRow.id) ?? prev);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("project_chat_messages").insert({
        account_id: accountId,
        project_id: projectId,
        sender_user_id: currentUserId,
        body,
      });
      if (error) {
        toast.error("Could not send message.");
        return;
      }
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("project_chat_messages").delete().eq("id", id);
    if (error) toast.error("Could not delete message.");
  }

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
              return (
                <div key={m.id} className={`group flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    {!isMe && <span className="text-[10px] font-medium text-muted-foreground">{sender?.full_name ?? "Unknown"}</span>}
                    <div className="flex items-center gap-1">
                      <div
                        className={`rounded-lg px-3 py-1.5 text-sm ${
                          isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                        }`}
                      >
                        {m.body}
                      </div>
                      {isMe && (
                        <button
                          type="button"
                          onClick={() => remove(m.id)}
                          aria-label="Delete message"
                          className="hidden text-muted-foreground hover:text-red-400 group-hover:block"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
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
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message the project team…"
          className="h-9 flex-1 rounded-md border border-border bg-muted px-3 text-sm text-foreground focus:outline-none"
        />
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
  );
}
