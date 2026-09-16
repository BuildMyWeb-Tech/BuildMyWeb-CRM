"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import type { Notification, NotificationCategory } from "@/types";
import {
  AlertCircle,
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Settings,
  UserPlus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Category config ────────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<
  NotificationCategory,
  { icon: typeof Bell; color: string; bg: string; dot: string; label: string }
> = {
  urgent:     { icon: AlertCircle,   color: "text-red-400",    bg: "bg-red-500/15",    dot: "bg-red-500",    label: "Urgent" },
  reminder:   { icon: Clock,         color: "text-amber-400",  bg: "bg-amber-500/15",  dot: "bg-amber-500",  label: "Reminder" },
  assignment: { icon: UserPlus,      color: "text-blue-400",   bg: "bg-blue-500/15",   dot: "bg-blue-500",   label: "Assignment" },
  mention:    { icon: MessageSquare, color: "text-purple-400", bg: "bg-purple-500/15", dot: "bg-purple-500", label: "Mention" },
  completed:  { icon: CheckCircle2,  color: "text-green-400",  bg: "bg-green-500/15",  dot: "bg-green-500",  label: "Completed" },
  system:     { icon: Settings,      color: "text-slate-400",  bg: "bg-slate-500/15",  dot: "bg-slate-400",  label: "System" },
};

function getCategory(n: Notification): NotificationCategory {
  if (n.category) return n.category;
  // Legacy fallback
  if (n.type === 'conversation_assigned') return 'assignment';
  if (n.type === 'lead_follow_up_due') return 'reminder';
  return 'system';
}

/**
 * Top-bar notification bell with category-colored indicators and
 * per-notification mark-read.
 */
export function NotificationBell() {
  const router = useRouter();
  const { accountId } = useAuth();
  const unreadCount = useUnreadNotifications();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeCategory, setActiveCategory] = useState<NotificationCategory | "all">("all");

  const load = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return;
    setNotifications((data ?? []) as Notification[]);
  }, [accountId]);

  useEffect(() => {
    if (open && notifications === null) load();
  }, [open, notifications, load]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-bell-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as Notification;
          setNotifications((prev) => {
            if (!prev) return [row];
            if (prev.some((n) => n.id === row.id)) return prev;
            return [row, ...prev].slice(0, 50);
          });
          // PWA / browser push
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(row.title, {
                body: row.body ?? "",
                icon: "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
              });
            } catch { /* ignore — no SW registered yet */ }
          }
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as Notification;
          setNotifications((prev) => prev?.map((n) => (n.id === row.id ? { ...n, ...row } : n)) ?? prev);
        } else if (payload.eventType === "DELETE") {
          const oldRow = payload.old as Partial<Notification>;
          setNotifications((prev) => prev?.filter((n) => n.id !== oldRow.id) ?? prev);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev?.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)) ?? prev,
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("id", id)
      .is("read_at", null);
    if (error) { toast.error("Failed to mark as read"); load(); }
  }, [load]);

  const handleClick = useCallback((n: Notification) => {
    if (!n.read_at) markRead(n.id);
    setOpen(false);
    const url = n.action_url
      ?? (n.conversation_id ? `/inbox?c=${n.conversation_id}` : null)
      ?? (n.lead_id ? `/client-leads/${n.lead_id}` : null);
    if (url) router.push(url);
  }, [markRead, router]);

  const unreadIds = notifications?.filter((n) => !n.read_at).map((n) => n.id) ?? [];

  const markAllRead = useCallback(async () => {
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications((prev) => prev?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? prev);
    const supabase = createClient();
    const { error } = await supabase.from("notifications").update({ read_at: now }).is("read_at", null);
    setMarkingAll(false);
    if (error) { toast.error("Failed to mark all as read"); load(); }
  }, [unreadIds.length, load]);

  const visibleNotifications = (notifications ?? []).filter((n) =>
    activeCategory === "all" || getCategory(n) === activeCategory
  );

  const categories: (NotificationCategory | "all")[] = ["all", "urgent", "assignment", "mention", "reminder", "completed", "system"];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none data-popup-open:bg-muted"
        aria-label="Notifications"
        onClick={() => {
          if (typeof Notification !== "undefined" && Notification.permission === "default") {
            Notification.requestPermission().catch(() => {});
          }
        }}
      >
        {unreadCount > 0 ? (
          <BellRing className="h-[18px] w-[18px]" />
        ) : (
          <Bell className="h-[18px] w-[18px]" />
        )}
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-96 max-w-[95vw] bg-popover p-0 text-popover-foreground ring-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-foreground" />
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={unreadIds.length === 0 || markingAll}
            onClick={markAllRead}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
            Mark all read
          </button>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5 scrollbar-none">
          {categories.map((cat) => {
            const cfg = cat !== "all" ? CATEGORY_CONFIG[cat] : null;
            const unreadInCat = cat === "all"
              ? unreadIds.length
              : (notifications ?? []).filter((n) => !n.read_at && getCategory(n) === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize transition-colors",
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {cfg && <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />}
                {cat === "all" ? "All" : cfg?.label}
                {unreadInCat > 0 && (
                  <span className="rounded-full bg-current/20 px-1 text-[9px]">{unreadInCat}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification list */}
        <div className="max-h-[28rem] overflow-y-auto">
          {notifications === null ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Bell className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <ul>
              {visibleNotifications.map((n) => {
                const cat = getCategory(n);
                const cfg = CATEGORY_CONFIG[cat];
                const Icon = cfg.icon;
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-border/50 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50",
                        isUnread && "bg-primary/5"
                      )}
                    >
                      {/* Category icon */}
                      <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cfg.bg)}>
                        <Icon className={cn("h-4 w-4", cfg.color)} />
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Category badge + unread dot */}
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <span className={cn("text-[9px] font-bold uppercase tracking-wide", cfg.color)}>
                            {cfg.label}
                          </span>
                          {isUnread && <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />}
                        </div>
                        <p className={cn("text-xs font-semibold leading-snug", isUnread ? "text-foreground" : "text-muted-foreground")}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.body}</p>
                        )}
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>

                      {/* Mark read button */}
                      {isUnread && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                          title="Mark as read"
                          className="mt-1 shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-3 py-2 text-center">
          <button
            type="button"
            onClick={() => { setOpen(false); router.push("/notifications"); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all notifications →
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
