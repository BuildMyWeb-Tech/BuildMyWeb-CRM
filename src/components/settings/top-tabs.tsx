"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Horizontal top tab bar — used by Settings and Workspace instead
// of the previous SettingsRail (left-sidebar sub-nav). Per BMW's
// call: these two pages navigate their own sections via tabs across
// the top, not a second sidebar down the left. SettingsRail itself
// is left untouched/unused rather than deleted, in case anything
// else still imports it.

export interface TopTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

interface TopTabsProps<T extends string> {
  tabs: TopTab<T>[];
  active: T;
  onSelect: (tab: T) => void;
}

export function TopTabs<T extends string>({ tabs, active, onSelect }: TopTabsProps<T>) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
            active === tab.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <tab.icon className="h-3.5 w-3.5" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
