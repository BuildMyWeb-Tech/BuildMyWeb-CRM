"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Todo, TodoPriority } from "@/types";
import {
  CheckCircle2,
  Circle,
  Globe2,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRIORITIES: TodoPriority[] = ["low", "medium", "high", "urgent"];
const PRIORITY_STYLE: Record<TodoPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-500",
  urgent: "bg-red-500/15 text-red-400",
};

/**
 * Personal / public to-do list — same DropdownMenu popover pattern as
 * NotificationBell (src/components/layout/notification-bell.tsx),
 * with an added "maximize" mode that expands the same list into a
 * near-fullscreen overlay instead of a small popup. Every item
 * belongs to its creator (`user_id`); flipping "Public" shares it
 * read-only with the whole account — RLS (070_todos_...sql) enforces
 * both the visibility and the "only the owner can edit" rule, so the
 * UI doesn't need to re-derive who can touch what beyond comparing
 * user ids for the delete/edit affordances.
 */
export function TodoList() {
  const { accountId, user } = useAuth();
  const instanceId = useId();
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [tab, setTab] = useState<"mine" | "public">("mine");
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    if (!accountId) return;
    const supabase = createClient();
    supabase
      .from("todos")
      .select("*")
      .eq("account_id", accountId)
      .order("is_done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setTodos((data ?? []) as Todo[]);
      });
  }, [accountId]);

  useEffect(() => {
    if (open && todos === null) load();
  }, [open, todos, load]);

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`todos-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todos" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Todo;
            setTodos((prev) => {
              if (!prev) return [row];
              if (prev.some((t) => t.id === row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Todo;
            setTodos((prev) => prev?.map((t) => (t.id === row.id ? row : t)) ?? prev);
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Todo>;
            setTodos((prev) => prev?.filter((t) => t.id !== oldRow.id) ?? prev);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, instanceId]);

  const mine = useMemo(() => (todos ?? []).filter((t) => t.user_id === user?.id), [todos, user?.id]);
  const publicTodos = useMemo(() => (todos ?? []).filter((t) => t.is_public && t.user_id !== user?.id), [todos, user?.id]);
  const openMineCount = mine.filter((t) => !t.is_done).length;

  async function addTodo() {
    const title = newTitle.trim();
    if (!title || !accountId || !user) return;
    setAdding(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("todos").insert({
        account_id: accountId,
        user_id: user.id,
        title,
        priority: "medium",
      });
      if (error) {
        toast.error("Could not add to-do.");
        return;
      }
      setNewTitle("");
    } finally {
      setAdding(false);
    }
  }

  async function toggleDone(todo: Todo) {
    const supabase = createClient();
    const { error } = await supabase.from("todos").update({ is_done: !todo.is_done }).eq("id", todo.id);
    if (error) toast.error("Could not update to-do.");
  }

  async function togglePublic(todo: Todo) {
    const supabase = createClient();
    const { error } = await supabase.from("todos").update({ is_public: !todo.is_public }).eq("id", todo.id);
    if (error) toast.error("Could not update to-do.");
  }

  async function setPriority(todo: Todo, priority: TodoPriority) {
    const supabase = createClient();
    const { error } = await supabase.from("todos").update({ priority }).eq("id", todo.id);
    if (error) toast.error("Could not update to-do.");
  }

  async function setDueDate(todo: Todo, dueDate: string) {
    const supabase = createClient();
    const { error } = await supabase.from("todos").update({ due_date: dueDate || null }).eq("id", todo.id);
    if (error) toast.error("Could not update to-do.");
  }

  async function remove(todo: Todo) {
    const supabase = createClient();
    const { error } = await supabase.from("todos").delete().eq("id", todo.id);
    if (error) toast.error("Could not delete to-do.");
  }

  const list = tab === "mine" ? mine : publicTodos;

  const body = (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">To-do list</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMaximized((v) => !v)}
            aria-label={maximized ? "Minimize" : "Maximize"}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            tab === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Mine ({mine.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("public")}
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
            tab === "public" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Globe2 className="h-3 w-3" />
          Public ({publicTodos.length})
        </button>
      </div>

      {tab === "mine" && (
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a to-do…"
            className="h-7 border-border bg-muted text-xs text-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter") addTodo();
            }}
          />
          <button
            type="button"
            onClick={addTodo}
            disabled={adding || !newTitle.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className={cn("overflow-y-auto", maximized ? "flex-1" : "max-h-96")}>
        {todos === null ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <ListChecks className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {tab === "mine" ? "No to-dos yet." : "No public to-dos from others."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {list.map((todo) => {
              const isOwner = todo.user_id === user?.id;
              return (
                <li key={todo.id} className="flex items-start gap-2.5 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => isOwner && toggleDone(todo)}
                    disabled={!isOwner}
                    aria-label={todo.is_done ? "Mark as not done" : "Mark as done"}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary disabled:hover:text-muted-foreground"
                  >
                    {todo.is_done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", todo.is_done ? "text-muted-foreground line-through" : "text-foreground")}>
                      {todo.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {isOwner && maximized ? (
                        <Select value={todo.priority} onValueChange={(v) => v && setPriority(todo, v as TodoPriority)}>
                          <SelectTrigger size="sm" className="h-5 px-1.5 text-[10px]">
                            <SelectValue className="capitalize">{(v: string) => v}</SelectValue>
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {PRIORITIES.map((p) => (
                              <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize", PRIORITY_STYLE[todo.priority])}>
                          {todo.priority}
                        </span>
                      )}
                      {isOwner && maximized ? (
                        <input
                          type="date"
                          value={todo.due_date ?? ""}
                          onChange={(e) => setDueDate(todo, e.target.value)}
                          className="h-5 rounded border border-border bg-muted px-1 text-[10px] text-foreground"
                        />
                      ) : (
                        todo.due_date && <span className="text-[10px] text-muted-foreground">{new Date(todo.due_date).toLocaleDateString()}</span>
                      )}
                      {todo.is_public && (
                        <span className="flex items-center gap-0.5 text-[10px] text-primary">
                          <Globe2 className="h-2.5 w-2.5" />
                          Public
                        </span>
                      )}
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => togglePublic(todo)}
                        aria-label={todo.is_public ? "Make private" : "Make public"}
                        className={cn("flex h-5 w-5 items-center justify-center rounded hover:bg-muted", todo.is_public ? "text-primary" : "text-muted-foreground")}
                        title={todo.is_public ? "Make private" : "Make public — visible to everyone in the CRM"}
                      >
                        <Globe2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(todo)}
                        aria-label="Delete to-do"
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  if (maximized) {
    return (
      <>
        <TriggerButton openMineCount={openMineCount} onClick={() => setOpen((v) => !v)} />
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4 sm:p-10">
            <div className="flex h-full w-full max-w-2xl flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
              {body}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none data-popup-open:bg-muted"
        aria-label="To-do list"
      >
        <ListChecks className="h-[18px] w-[18px]" />
        {openMineCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {openMineCount > 9 ? "9+" : openMineCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-80 max-w-[90vw] bg-popover p-0 text-popover-foreground ring-border"
      >
        {body}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TriggerButton({ openMineCount, onClick }: { openMineCount: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="To-do list"
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
    >
      <ListChecks className="h-[18px] w-[18px]" />
      {openMineCount > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
          {openMineCount > 9 ? "9+" : openMineCount}
        </span>
      )}
    </button>
  );
}
