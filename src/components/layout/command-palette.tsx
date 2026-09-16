"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  ClipboardList,
  ExternalLink,
  Folder,
  Loader2,
  Package,
  Search,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/app/api/search/route";

type GroupedResults = Record<string, SearchResult[]>;

const GROUP_LABELS: Record<string, string> = {
  clients: "Clients",
  enquiries: "Enquiries",
  projects: "Projects",
  tasks: "Project Tasks",
  products: "Products",
  product_tasks: "Product Tasks",
  contacts: "Contacts",
};

const TYPE_ICON: Record<SearchResult["type"], typeof Search> = {
  client: Users,
  enquiry: Briefcase,
  project: Folder,
  project_task: ClipboardList,
  product: Package,
  product_task: ClipboardList,
  contact: Users,
  file: ExternalLink,
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupedResults>({});
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // All results flattened for keyboard nav
  const flat: SearchResult[] = Object.values(results).flat();

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setResults({});
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Ctrl+K / Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) { openPalette(); return true; }
          return false;
        });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPalette]);

  // Search debounce
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults({}); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? {});
          setSelectedIndex(0);
        }
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open]);

  function navigate(url: string) {
    setOpen(false);
    router.push(url);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flat.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && flat[selectedIndex]) {
      navigate(flat[selectedIndex].url);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPalette}
        className="hidden lg:flex h-9 w-64 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
        aria-label="Search"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Search everything…</span>
        <kbd className="hidden sm:inline rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
          Ctrl K
        </kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-background/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {loading
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search clients, projects, tasks, contacts…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search…
            </p>
          )}
          {query.length >= 2 && !loading && flat.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results for <strong>"{query}"</strong>
            </p>
          )}
          {Object.entries(results).map(([group, items]) => {
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="sticky top-0 bg-popover/95 backdrop-blur-sm px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50">
                  {GROUP_LABELS[group] ?? group}
                </p>
                {items.map((item) => {
                  const globalIdx = flat.findIndex((f) => f.id === item.id && f.type === item.type);
                  const Icon = TYPE_ICON[item.type] ?? Search;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onClick={() => navigate(item.url)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        globalIdx === selectedIndex
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted/60 text-foreground"
                      )}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.subtitle && (
                          <p className="truncate text-[11px] text-muted-foreground capitalize">{item.subtitle}</p>
                        )}
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span><kbd className="rounded border border-border bg-muted px-1">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-border bg-muted px-1">↵</kbd> open</span>
          <span><kbd className="rounded border border-border bg-muted px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
