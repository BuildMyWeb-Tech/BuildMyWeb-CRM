"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AtSign, Loader2, MessageSquare, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { AccountMember, DirectMessage } from "@/types";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const cls = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary`}>
      {initials}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user, profile, accountId } = useAuth();
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  // @mention picker state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = picker hidden
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // All members including non-selected (for mention picker)
  const [allMembers, setAllMembers] = useState<AccountMember[]>([]);

  // Load team members
  useEffect(() => {
    if (!accountId) return;
    fetch("/api/account/members")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.members) {
          const all = d.members as AccountMember[];
          setAllMembers(all);
          setMembers(all.filter((m) => m.user_id !== user?.id));
        }
      });
  }, [accountId, user?.id]);

  // Load thread list (unread counts)
  const loadThreads = useCallback(() => {
    if (!user?.id) return;
    fetch("/api/direct-messages")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.threads) {
          const map: Record<string, number> = {};
          for (const t of d.threads) map[t.partner_id] = t.unread ?? 0;
          setUnreadMap(map);
        }
      });
  }, [user?.id]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Load messages for selected conversation
  const loadMessages = useCallback(() => {
    if (!selectedUserId || !user?.id) return;
    fetch(`/api/direct-messages/${selectedUserId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.messages) setMessages(d.messages);
      });
    // Mark as read
    fetch(`/api/direct-messages/${selectedUserId}`, { method: "PATCH" }).then(() => {
      setUnreadMap((prev) => ({ ...prev, [selectedUserId]: 0 }));
    });
  }, [selectedUserId, user?.id]);

  useEffect(() => {
    setMessages(null);
    loadMessages();
  }, [loadMessages]);

  // Realtime subscription for incoming DMs
  useEffect(() => {
    if (!accountId || !user?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`direct-messages:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new as DirectMessage;
          if (msg.sender_id === selectedUserId) {
            setMessages((prev) => {
              if (!prev) return [msg];
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            // auto-mark read
            fetch(`/api/direct-messages/${msg.sender_id}`, { method: "PATCH" });
          } else {
            setUnreadMap((prev) => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] ?? 0) + 1 }));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accountId, user?.id, selectedUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  // Extract @mentioned user IDs from draft text
  const mentionedUserIds = useMemo(() => {
    const handles = Array.from(draft.matchAll(/@(\w[\w\s]*?)(?=\s|$|@)/g)).map((m) => m[1].trim().toLowerCase());
    return allMembers
      .filter((m) => handles.some((h) => m.full_name?.toLowerCase().startsWith(h)))
      .map((m) => m.user_id);
  }, [draft, allMembers]);

  async function send() {
    const body = draft.trim();
    if (!body || !selectedUserId || !user?.id) return;
    setSending(true);
    setMentionQuery(null);
    const optimistic: DirectMessage = {
      id: crypto.randomUUID(),
      account_id: accountId ?? "",
      sender_id: user.id,
      recipient_id: selectedUserId,
      body,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setDraft("");
    try {
      const r = await fetch("/api/direct-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: selectedUserId, body, mention_user_ids: mentionedUserIds }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        toast.error(errData?.detail ? `Send failed: ${errData.detail}` : "Could not send message");
        setMessages((prev) => prev?.filter((m) => m.id !== optimistic.id) ?? null);
      }
    } finally {
      setSending(false);
    }
  }

  function onDraftChange(value: string) {
    setDraft(value);
    // Detect @query for mention picker
    const atIdx = value.lastIndexOf("@");
    if (atIdx >= 0) {
      const after = value.slice(atIdx + 1);
      if (!after.includes(" ") || after.length === 0) {
        setMentionQuery(after.toLowerCase());
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  }

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return allMembers.filter(
      (m) => m.user_id !== user?.id && (m.full_name?.toLowerCase().startsWith(mentionQuery) ?? false)
    ).slice(0, 5);
  }, [mentionQuery, allMembers, user?.id]);

  function insertMention(member: AccountMember) {
    const atIdx = draft.lastIndexOf("@");
    const newDraft = draft.slice(0, atIdx) + `@${member.full_name} `;
    setDraft(newDraft);
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  const selectedMember = members.find((m) => m.user_id === selectedUserId);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-background">
      {/* ── Sidebar: conversation list ── */}
      <div className="flex w-64 flex-col border-r border-border bg-card shrink-0">
        <div className="border-b border-border px-4 py-3">
          <h1 className="font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Messages
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">Direct messages with your team</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {members.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No team members found</p>
          ) : (
            members.map((m) => {
              const unread = unreadMap[m.user_id] ?? 0;
              const isSelected = m.user_id === selectedUserId;
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => setSelectedUserId(m.user_id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isSelected ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <div className="relative">
                    <Avatar name={m.full_name ?? "?"} size="sm" />
                    {unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${unread > 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                      {m.full_name}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground capitalize">{m.role}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Main chat pane ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selectedUserId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium text-foreground">Select a conversation</p>
              <p className="text-sm text-muted-foreground">Pick a team member from the sidebar to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border bg-card px-5 py-3">
              <Avatar name={selectedMember?.full_name ?? "?"} />
              <div>
                <p className="font-semibold text-foreground">{selectedMember?.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{selectedMember?.role}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5">
              {messages === null ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No messages yet — say hi!</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((m) => {
                    const isMe = m.sender_id === user?.id;
                    return (
                      <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        {!isMe && (
                          <div className="mr-2 mt-auto">
                            <Avatar name={selectedMember?.full_name ?? "?"} size="sm" />
                          </div>
                        )}
                        <div className={`max-w-[70%] flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                          <div
                            className={`rounded-2xl px-4 py-2 text-sm ${
                              isMe
                                ? "rounded-br-sm bg-primary text-primary-foreground"
                                : "rounded-bl-sm bg-muted text-foreground"
                            }`}
                          >
                            {m.body.split(/(@\w[\w\s]*?)(?=\s|$)/).map((part, i) =>
                              part.startsWith("@") ? (
                                <span key={i} className="font-semibold text-purple-400">{part}</span>
                              ) : part
                            )}
                          </div>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="relative border-t border-border bg-card p-4">
              {/* @mention picker */}
              {mentionSuggestions.length > 0 && (
                <div className="absolute bottom-full left-4 right-4 mb-1 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                  {mentionSuggestions.map((m, idx) => (
                    <button
                      key={m.user_id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${idx === mentionIndex ? "bg-primary/10 text-foreground" : "hover:bg-muted text-foreground"}`}
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                        {m.full_name?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="truncate text-sm font-medium">{m.full_name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{m.role}</p>
                      </div>
                      <AtSign className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (mentionSuggestions.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionSuggestions.length - 1)); return; }
                      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex]); return; }
                      if (e.key === "Escape") { setMentionQuery(null); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder={`Message ${selectedMember?.full_name ?? ""}… (use @ to mention)`}
                  className="h-10 flex-1 rounded-full border border-border bg-muted px-4 text-sm text-foreground focus:outline-none"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              {profile?.full_name && (
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  Sending as {profile.full_name} · type @ to mention a teammate
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
