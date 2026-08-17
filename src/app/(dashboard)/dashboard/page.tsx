"use client"

import { useState } from 'react'
import { LayoutGrid, MessageSquare, KanbanSquare, Building2 } from 'lucide-react'

import { SalesDashboard } from '@/components/dashboard/sales-dashboard'
import { ProjectsDashboard } from '@/components/dashboard/projects-dashboard'
import { OfficeDashboard } from '@/components/dashboard/office-dashboard'
import { OverviewDashboard } from '@/components/dashboard/overview-dashboard'

type DashboardTab = 'overview' | 'sales' | 'projects' | 'office'

const TABS: Array<{ id: DashboardTab; label: string; icon: typeof LayoutGrid }> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'sales', label: 'Sales', icon: MessageSquare },
  { id: 'projects', label: 'Projects', icon: KanbanSquare },
  { id: 'office', label: 'Office', icon: Building2 },
]

// Thin tab switcher. Loads Overview by default (a condensed summary
// across all 3 modules); each other tab is that module's full
// advanced dashboard. Sales' tab is the original dashboard content,
// untouched — just moved into its own component
// (components/dashboard/sales-dashboard.tsx) so it could sit behind
// a tab instead of being the only view.
export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>('overview')

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && <OverviewDashboard onNavigate={setTab} />}
        {tab === 'sales' && <SalesDashboard />}
        {tab === 'projects' && <ProjectsDashboard />}
        {tab === 'office' && <OfficeDashboard />}
      </div>
    </div>
  )
}