"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import type { Notification } from "@/types";
import { Bell, CheckCheck, Clock, Loader2, UserPlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TYPE_ICON: Record<Notification["type"], typeof Bell> = {
  conversation_assigned: UserPlus,
  lead_follow_up_due: Clock,
};

/**
 * Top-bar notification bell — replaces the old sidebar "Notifications"
 * page link. Lives next to the theme toggle in the Header so it's
 * reachable from every page without a dedicated nav slot.
 */
export function NotificationBell() {
  const router = useRouter();
  const { accountId } = useAuth();
  const unreadCount = useUnreadNotifications();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return;
    setNotifications((data ?? []) as Notification[]);
  }, [accountId]);

  useEffect(() => {
    if (open && notifications === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
  }, [open, notifications, load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Notification;
            setNotifications((prev) => {
              if (!prev) return [row];
              if (prev.some((n) => n.id === row.id)) return prev;
              return [row, ...prev].slice(0, 20);
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Notification;
            setNotifications(
              (prev) => prev?.map((n) => (n.id === row.id ? { ...n, ...row } : n)) ?? prev,
            );
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Notification>;
            setNotifications((prev) => prev?.filter((n) => n.id !== oldRow.id) ?? prev);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifications(
      (prev) =>
        prev?.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)) ?? prev,
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
    if (error) {
      toast.error("Failed to mark notification as read");
      load();
    }
  }, [load]);

  const handleClick = useCallback(
    (n: Notification) => {
      if (!n.read_at) markRead(n.id);
      setOpen(false);
      if (n.conversation_id) router.push(`/inbox?c=${n.conversation_id}`);
      else if (n.lead_id) router.push(`/client-leads`);
    },
    [markRead, router],
  );

  const unreadIds = notifications?.filter((n) => !n.read_at).map((n) => n.id) ?? [];

  const markAllRead = useCallback(async () => {
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications((prev) => prev?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? prev);
    const supabase = createClient();
    const { error } = await supabase.from("notifications").update({ read_at: now }).is("read_at", null);
    setMarkingAll(false);
    if (error) {
      toast.error("Failed to mark all as read");
      load();
    }
  }, [unreadIds.length, load]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none data-popup-open:bg-muted"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-80 max-w-[90vw] bg-popover p-0 text-popover-foreground ring-border"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          <button
            type="button"
            disabled={unreadIds.length === 0 || markingAll}
            onClick={markAllRead}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
            Mark all read
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications === null ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
              <Bell className="h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <ul>
              {notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell;
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/60",
                        isUnread && "bg-primary/5",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md",
                          isUnread ? "bg-primary/15" : "bg-muted",
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5", isUnread ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("truncate text-xs font-medium", isUnread ? "text-foreground" : "text-muted-foreground")}>
                            {n.title}
                          </span>
                          {isUnread && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />}
                        </div>
                        {n.body && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{n.body}</p>}
                        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
