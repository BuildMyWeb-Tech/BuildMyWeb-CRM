"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check, Download, FileText, Image, Loader2, Paperclip,
  Pencil, Pin, Reply, Send, Trash2, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AccountMember, ProjectChatMessage } from "@/types";
import { toast } from "sonner";

const BUCKET = "chat-attachments";

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
  // Reply-to state
  const [replyTo, setReplyTo] = useState<ProjectChatMessage | null>(null);
  // File attachment
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // Swipe state per message
  const touchStartX = useRef<Record<string, number>>({});
  const [swipedId, setSwipedId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const membersById = new Map(members.map((m) => [m.user_id, m]));

  // ── Load messages ──────────────────────────────────────────────────────────
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

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project-chat:${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as ProjectChatMessage;
          setMessages((prev) => {
            if (!prev) return [row];
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as ProjectChatMessage;
          setMessages((prev) => prev?.map((m) => m.id === row.id ? row : m) ?? prev);
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const oldRow = payload.old as Partial<ProjectChatMessage>;
          setMessages((prev) => prev?.filter((m) => m.id !== oldRow.id) ?? prev);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  // ── Upload file to Supabase Storage ───────────────────────────────────────
  async function uploadFile(file: File): Promise<{ url: string; type: "image" | "pdf"; name: string } | null> {
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
    const isPdf = ext === "pdf";
    if (!isImage && !isPdf) { toast.error("Only images and PDFs are supported."); return null; }
    const path = `${accountId}/${projectId}/${Date.now()}_${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) { toast.error("Upload failed: " + error.message); return null; }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, type: isImage ? "image" : "pdf", name: file.name };
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function send() {
    const body = draft.trim();
    if (!body && !attachmentFile) return;
    setSending(true);
    setUploading(!!attachmentFile);

    let attachmentUrl: string | null = null;
    let attachmentType: "image" | "pdf" | null = null;
    let attachmentName: string | null = null;

    if (attachmentFile) {
      const result = await uploadFile(attachmentFile);
      if (!result) { setSending(false); setUploading(false); return; }
      attachmentUrl = result.url;
      attachmentType = result.type;
      attachmentName = result.name;
    }
    setUploading(false);

    const tempId = crypto.randomUUID();
    const optimistic: ProjectChatMessage = {
      id: tempId,
      account_id: accountId,
      project_id: projectId,
      sender_user_id: currentUserId,
      body: body || "",
      is_note: isNote,
      created_at: new Date().toISOString(),
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      attachment_name: attachmentName,
      reply_to_id: replyTo?.id ?? null,
    };
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setDraft("");
    setAttachmentFile(null);
    setReplyTo(null);
    setMentionQuery(null);
    const noteVal = isNote;
    setIsNote(false);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("project_chat_messages").insert({
        account_id: accountId,
        project_id: projectId,
        sender_user_id: currentUserId,
        body: body || "",
        is_note: noteVal,
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
        attachment_name: attachmentName,
        reply_to_id: replyTo?.id ?? null,
      }).select("*").single();
      if (error) {
        toast.error("Could not send message.");
        setMessages((prev) => prev?.filter((m) => m.id !== tempId) ?? null);
        return;
      }
      if (data) {
        setMessages((prev) => prev?.map((m) => m.id === tempId ? (data as ProjectChatMessage) : m) ?? prev);
      }
    } finally { setSending(false); }
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
    const { error } = await supabase.from("project_chat_messages").update({ body }).eq("id", id);
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

  // ── Swipe-to-reply (touch) ────────────────────────────────────────────────
  function onTouchStart(id: string, e: React.TouchEvent) {
    touchStartX.current[id] = e.touches[0].clientX;
  }
  function onTouchEnd(msg: ProjectChatMessage, e: React.TouchEvent) {
    const startX = touchStartX.current[msg.id];
    if (startX === undefined) return;
    const dx = e.changedTouches[0].clientX - startX;
    const isMe = msg.sender_user_id === currentUserId;
    // Swipe right on others' messages, swipe left on own messages
    const threshold = 60;
    if ((!isMe && dx > threshold) || (isMe && dx < -threshold)) {
      setReplyTo(msg);
      inputRef.current?.focus();
      setSwipedId(msg.id);
      setTimeout(() => setSwipedId(null), 400);
    }
    delete touchStartX.current[msg.id];
  }

  const mentionMembers = mentionQuery !== null
    ? members.filter((m) => (m.full_name ?? "").toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  function getReplyPreview(msg: ProjectChatMessage) {
    if (!msg.reply_to_id) return null;
    return messages?.find((m) => m.id === msg.reply_to_id) ?? null;
  }

  return (
    <div className="flex h-[60vh] flex-col rounded-lg border border-border">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
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
              const replied = getReplyPreview(m);
              const isSwiped = swipedId === m.id;

              if (m.is_note) {
                return (
                  <div key={m.id} className={`group mx-auto w-full max-w-[90%] transition-transform duration-200 ${isSwiped ? "translate-x-2" : ""}`}
                    onTouchStart={(e) => onTouchStart(m.id, e)}
                    onTouchEnd={(e) => onTouchEnd(m, e)}
                  >
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
                            <input autoFocus value={editBody} onChange={(e) => setEditBody(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(m.id); } if (e.key === "Escape") setEditingId(null); }}
                              className="flex-1 rounded border border-amber-400/50 bg-transparent px-2 py-0.5 text-sm text-amber-900 dark:text-amber-100 focus:outline-none" />
                            <button type="button" onClick={() => saveEdit(m.id)} className="text-green-500 hover:text-green-400"><Check className="h-3.5 w-3.5" /></button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <p className="text-sm text-amber-900 dark:text-amber-100 break-words">{m.body}</p>
                        )}
                      </div>
                      {isMe && !isEditing && (
                        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }} className="text-muted-foreground hover:text-blue-400"><Reply className="h-3 w-3" /></button>
                          <button type="button" onClick={() => { setEditingId(m.id); setEditBody(m.body); }} className="text-muted-foreground hover:text-amber-400"><Pencil className="h-3 w-3" /></button>
                          <button type="button" onClick={() => remove(m.id)} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id}
                  className={`group flex transition-transform duration-200 ${isMe ? "justify-end" : "justify-start"} ${isSwiped ? (isMe ? "-translate-x-2" : "translate-x-2") : ""}`}
                  onTouchStart={(e) => onTouchStart(m.id, e)}
                  onTouchEnd={(e) => onTouchEnd(m, e)}
                >
                  <div className={`max-w-[80%] sm:max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    {!isMe && <span className="text-[10px] font-medium text-muted-foreground px-1">{sender?.full_name ?? "Unknown"}</span>}

                    {/* Reply preview */}
                    {replied && (
                      <div className={`flex items-start gap-1.5 rounded-t-lg px-2.5 py-1.5 text-[11px] border-l-2 border-primary/60 bg-muted/60 mb-0.5 max-w-full ${isMe ? "self-end" : "self-start"}`}>
                        <Reply className="h-3 w-3 shrink-0 text-primary/60 mt-0.5" />
                        <span className="truncate text-muted-foreground">
                          <span className="font-medium text-foreground">{membersById.get(replied.sender_user_id ?? "")?.full_name ?? "?"}: </span>
                          {replied.attachment_name ? `📎 ${replied.attachment_name}` : (replied.body || "—")}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      {/* Reply button (hover, left for my messages) */}
                      {isMe && !isEditing && (
                        <div className="hidden group-hover:flex items-center gap-0.5">
                          <button type="button" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }} title="Reply" className="text-muted-foreground hover:text-blue-400"><Reply className="h-3 w-3" /></button>
                          <button type="button" onClick={() => { setEditingId(m.id); setEditBody(m.body); }} title="Edit" className="text-muted-foreground hover:text-blue-400"><Pencil className="h-3 w-3" /></button>
                          <button type="button" onClick={() => remove(m.id)} title="Delete" className="text-muted-foreground hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={editBody} onChange={(e) => setEditBody(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(m.id); } if (e.key === "Escape") setEditingId(null); }}
                            className="rounded-lg border border-primary/50 bg-muted px-3 py-1.5 text-sm text-foreground focus:outline-none w-48" />
                          <button type="button" onClick={() => saveEdit(m.id)} className="text-green-500 hover:text-green-400"><Check className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <div className={`rounded-lg overflow-hidden ${isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                          {/* Attachment */}
                          {m.attachment_url && m.attachment_type === "image" && (
                            <div className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.attachment_url} alt={m.attachment_name ?? "image"} className="max-w-[200px] sm:max-w-[240px] rounded-t-lg object-cover" />
                              <a href={m.attachment_url} download={m.attachment_name ?? "image"} target="_blank" rel="noopener noreferrer"
                                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                                <Download className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                          {m.attachment_url && m.attachment_type === "pdf" && (
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
                              <FileText className="h-4 w-4 shrink-0 opacity-80" />
                              <span className="text-xs truncate max-w-[140px]">{m.attachment_name ?? "document.pdf"}</span>
                              <a href={m.attachment_url} download={m.attachment_name ?? "document.pdf"} target="_blank" rel="noopener noreferrer"
                                className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-80 hover:opacity-100 transition-opacity">
                                <Download className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                          {/* Text body */}
                          {m.body && <p className="px-3 py-1.5 text-sm break-words">{m.body}</p>}
                        </div>
                      )}

                      {/* Reply button (hover, right for others' messages) */}
                      {!isMe && !isEditing && (
                        <div className="hidden group-hover:flex items-center gap-0.5">
                          <button type="button" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }} title="Reply" className="text-muted-foreground hover:text-blue-400"><Reply className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-muted-foreground px-1">{new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Compose area */}
      <div className="flex flex-col gap-1.5 border-t border-border p-2 sm:p-3">
        {/* Reply preview */}
        {replyTo && (
          <div className="flex items-center gap-2 rounded-md bg-muted/60 border-l-2 border-primary/60 px-2.5 py-1.5 text-xs">
            <Reply className="h-3 w-3 shrink-0 text-primary/60" />
            <span className="flex-1 truncate text-muted-foreground">
              <span className="font-medium text-foreground">{membersById.get(replyTo.sender_user_id ?? "")?.full_name ?? "?"}: </span>
              {replyTo.attachment_name ? `📎 ${replyTo.attachment_name}` : (replyTo.body || "—")}
            </span>
            <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Attachment preview */}
        {attachmentFile && (
          <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
            {attachmentFile.type.startsWith("image/") ? <Image className="h-3.5 w-3.5 text-blue-400" /> : <FileText className="h-3.5 w-3.5 text-orange-400" />}
            <span className="flex-1 truncate text-muted-foreground">{attachmentFile.name}</span>
            <button type="button" onClick={() => setAttachmentFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
          </div>
        )}

        {isNote && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
            <Pin className="h-3 w-3" /> Internal note — only visible to team members
          </div>
        )}

        <div className="relative flex items-center gap-1.5">
          {/* Note toggle */}
          <button type="button" onClick={() => setIsNote((v) => !v)} title={isNote ? "Switch to message" : "Add internal note"}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors ${isNote ? "border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400" : "border-border bg-muted text-muted-foreground hover:text-foreground"}`}>
            <Pin className="h-4 w-4" />
          </button>

          {/* Attachment button */}
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Paperclip className="h-4 w-4" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setAttachmentFile(f); e.target.value = ""; }} />

          {/* Text input */}
          <div className="relative flex-1">
            <input ref={inputRef} value={draft} onChange={handleDraftChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setMentionQuery(null); setReplyTo(null); return; }
                if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) { e.preventDefault(); send(); }
              }}
              placeholder={isNote ? "Add an internal note…" : "Message the project team… (@ to mention)"}
              className="h-9 w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground focus:outline-none" />
            {mentionMembers.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-52 rounded-lg border border-border bg-card shadow-xl z-50">
                {mentionMembers.map((m) => (
                  <button key={m.user_id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(m.full_name ?? ""); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg">
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

          {/* Send */}
          <button type="button" onClick={send} disabled={sending || (!draft.trim() && !attachmentFile)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
