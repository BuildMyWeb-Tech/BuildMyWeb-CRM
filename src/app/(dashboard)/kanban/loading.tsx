import { Loader2 } from "lucide-react";

// Route-level loading UI — Next.js shows this INSTANTLY on
// navigation (server-rendered, no JS/hydration needed) while the
// real "use client" page below streams in. Without this file, every
// dashboard page appears to hang until the client bundle hydrates
// and its own fetch resolves — this is the single biggest lever for
// perceived page-load speed on a "use client"-heavy app like this
// one, and costs nothing at the data layer.
export default function Loading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
