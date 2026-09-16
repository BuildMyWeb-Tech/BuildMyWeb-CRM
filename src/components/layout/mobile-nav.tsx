"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  Briefcase,
  ClipboardList,
  FolderPlus,
  Home,
  MessageSquare,
  Package,
  Plus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/overview", label: "Home", icon: Home },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/daily-tasks", label: "Tasks", icon: ClipboardList },
  { href: "/messages", label: "Chat", icon: MessageSquare },
];

const FAB_ACTIONS = [
  { label: "New Client", icon: Users, href: "/clients" },
  { label: "New Enquiry", icon: Briefcase, href: "/client-leads" },
  { label: "New Task", icon: ClipboardList, href: "/daily-tasks" },
  { label: "New Project", icon: FolderPlus, href: "/projects" },
  { label: "New Product", icon: Package, href: "/products" },
];

/** Bottom navigation bar — shown only on small screens (< lg). */
export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center border-t border-border bg-background px-2 lg:hidden safe-bottom">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_4px_var(--tw-shadow-color)] shadow-primary")} />
            <span className="text-[9px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Floating action button with quick-create options — shown only on mobile. */
export function MobileFAB() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const go = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  return (
    <div className="fixed bottom-20 right-4 z-50 lg:hidden">
      {/* Action items (shown above FAB when open) */}
      {open && (
        <div className="absolute bottom-14 right-0 flex flex-col-reverse gap-2 items-end">
          {FAB_ACTIONS.map(({ label, icon: Icon, href }) => (
            <button
              key={href}
              type="button"
              onClick={() => go(href)}
              className="flex items-center gap-2 rounded-full bg-popover border border-border shadow-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <span>{label}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Icon className="h-3.5 w-3.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Overlay to close */}
      {open && (
        <div
          className="fixed inset-0 -z-10"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main FAB */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-200",
          open
            ? "bg-muted text-foreground rotate-45"
            : "bg-primary text-primary-foreground"
        )}
        aria-label="Quick create"
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
}
