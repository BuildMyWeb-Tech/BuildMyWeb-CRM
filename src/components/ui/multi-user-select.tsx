"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { AccountMember } from "@/types";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Multi-select assignee picker — same trigger/popover shape as the
 * single-select shadcn `Select`, but toggles membership in an array
 * instead of replacing a single value. Used everywhere a task/lead
 * can now have more than one assignee.
 */
export function MultiUserSelect({
  members,
  value,
  onChange,
  placeholder = "Unassigned",
}: {
  members: AccountMember[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = members.filter((m) => value.includes(m.user_id));

  function toggle(userId: string) {
    onChange(value.includes(userId) ? value.filter((id) => id !== userId) : [...value, userId]);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="flex h-9 w-full items-center justify-between rounded-md border border-border bg-muted px-3 text-sm text-foreground focus:outline-none">
        <span className="flex flex-1 flex-wrap items-center gap-1 truncate text-left">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            selected.map((m) => (
              <span
                key={m.user_id}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
              >
                {m.full_name}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(m.user_id);
                  }}
                  className="hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto bg-popover p-1 text-popover-foreground">
        {members.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No members</p>}
        {members.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.user_id}
            checked={value.includes(m.user_id)}
            onCheckedChange={() => toggle(m.user_id)}
            onSelect={(e) => e.preventDefault()}
          >
            {m.full_name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
