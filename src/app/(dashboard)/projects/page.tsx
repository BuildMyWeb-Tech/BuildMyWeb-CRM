import { KanbanSquare } from "lucide-react";

// Placeholder landing for the Projects module (Phase 0). Real
// content — the projects list + per-project Kanban board — lands
// in Phase 2 once 041_client_projects.sql is applied. This stub
// exists purely so the sidebar link in src/lib/modules.ts resolves
// to a real page instead of a 404.
export default function ProjectsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <KanbanSquare className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">Projects</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Client projects and task boards land here in Phase 2.
      </p>
    </div>
  );
}