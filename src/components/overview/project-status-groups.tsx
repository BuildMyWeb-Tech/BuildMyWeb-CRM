"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Project, ProjectStatus } from "@/types";

// Projects grouped by status, collapsible — Active expanded by
// default (that's the group anyone opening this actually wants to
// see first), Inactive/Archived collapsed behind an arrow. No
// per-card status badge (redundant — the group heading already says
// it) and no "No client set" filler line; a card only shows the
// client name when there is one.
const GROUPS: { status: ProjectStatus; label: string; defaultOpen: boolean }[] = [
  { status: "active", label: "Active", defaultOpen: true },
  { status: "inactive", label: "Inactive", defaultOpen: false },
  { status: "archived", label: "Archived", defaultOpen: false },
];

export function ProjectStatusGroups({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState<Set<ProjectStatus>>(() => new Set(GROUPS.filter((g) => g.defaultOpen).map((g) => g.status)));

  function toggle(status: ProjectStatus) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((g) => {
        const items = projects.filter((p) => p.status === g.status);
        const isOpen = open.has(g.status);
        return (
          <div key={g.status}>
            <button
              type="button"
              onClick={() => toggle(g.status)}
              className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {g.label}
              <span className="text-muted-foreground/70">({items.length})</span>
            </button>
            {isOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {items.length === 0 ? (
                  <p className="pl-5 text-xs text-muted-foreground">None.</p>
                ) : (
                  items.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`}>
                      <Card className="transition-colors hover:border-primary/40">
                        <CardHeader className="pb-0">
                          <CardTitle className="text-sm">{p.name}</CardTitle>
                        </CardHeader>
                        {p.client_name && (
                          <CardContent className="pt-1.5">
                            <p className="truncate text-xs text-muted-foreground">{p.client_name}</p>
                          </CardContent>
                        )}
                      </Card>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
