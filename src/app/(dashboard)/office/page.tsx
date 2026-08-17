import { Building2 } from "lucide-react";

// Placeholder landing for the Office module (Phase 0). Real content
// — company info, documents, bills — lands in Phase 3 once
// 042_bmw_office.sql is applied. This stub exists purely so the
// sidebar link in src/lib/modules.ts (admin+ only) resolves to a
// real page instead of a 404.
export default function OfficePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Building2 className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">Office</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Company info, documents, and bills land here in Phase 3.
      </p>
    </div>
  );
}