// Shared date-range presets for task filtering (Daily Tasks, and
// anywhere else that needs "today/this week"-style filtering).
// Everything computed in the browser's local timezone — a "week"
// runs Monday-Sunday.

export type DatePreset = "all" | "overdue" | "today" | "tomorrow" | "this_week" | "next_week";

export const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "this_week", label: "This Week" },
  { id: "next_week", label: "Next Week" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday of the week containing `d` (ISO week, Monday-first). */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  x.setDate(x.getDate() + diff);
  return x;
}

/**
 * Returns true if `dateStr` (a "YYYY-MM-DD" date, e.g. a task's
 * due_date/target_date) falls within `preset`, relative to now.
 * A null dateStr never matches anything except "all".
 */
export function matchesDatePreset(dateStr: string | null, preset: DatePreset): boolean {
  if (preset === "all") return true;
  if (!dateStr) return false;

  const date = startOfDay(new Date(dateStr));
  const today = startOfDay(new Date());

  switch (preset) {
    case "overdue":
      return date.getTime() < today.getTime();
    case "today":
      return date.getTime() === today.getTime();
    case "tomorrow": {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return date.getTime() === tomorrow.getTime();
    }
    case "this_week": {
      const weekStart = startOfWeek(today);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return date.getTime() >= weekStart.getTime() && date.getTime() <= weekEnd.getTime();
    }
    case "next_week": {
      const thisWeekStart = startOfWeek(today);
      const nextWeekStart = new Date(thisWeekStart);
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);
      const nextWeekEnd = new Date(nextWeekStart);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
      return date.getTime() >= nextWeekStart.getTime() && date.getTime() <= nextWeekEnd.getTime();
    }
  }
}
