"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  DollarSign,
  KanbanSquare,
  CalendarClock,
  ClipboardCheck,
  FileStack,
  ArrowRight,
} from 'lucide-react'

import {
  loadMetrics,
  loadProjectsMetrics,
  loadOfficeMetrics,
} from '@/lib/dashboard/queries'
import type { MetricsBundle, OfficeMetrics, ProjectsMetrics } from '@/lib/dashboard/types'

import { MetricCard } from './metric-card'
import { SkeletonCard } from './skeleton'

interface OverviewDashboardProps {
  onNavigate: (tab: 'sales' | 'projects' | 'office') => void
}

// The default landing tab — a condensed 2-cards-per-module summary
// so you see the shape of the whole company at a glance, then click
// through (or use the tab bar) for the full advanced dashboard.
// Deliberately lighter than the module tabs: no charts, no activity
// feed — those live one click away.
export function OverviewDashboard({ onNavigate }: OverviewDashboardProps) {
  const { defaultCurrency } = useAuth()
  const [sales, setSales] = useState<MetricsBundle | null>(null)
  const [projects, setProjects] = useState<ProjectsMetrics | null>(null)
  const [office, setOffice] = useState<OfficeMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()
    setLoading(true)
    Promise.all([loadMetrics(db), loadProjectsMetrics(db), loadOfficeMetrics(db)])
      .then(([s, p, o]) => {
        setSales(s)
        setProjects(p)
        setOffice(o)
      })
      .catch((err) => console.error('[overview-dashboard] failed:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live analytics across Sales, Projects, and Office.
        </p>
      </div>

      <ModuleSection
        title="Sales"
        onViewAll={() => onNavigate('sales')}
      >
        {loading || !sales ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard
              title="Active Conversations"
              value={sales.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
            />
            <MetricCard
              title="Open Deals Value"
              value={formatCurrency(sales.openDealsValue, defaultCurrency)}
              icon={DollarSign}
              subtitle={`${sales.openDealsCount} open deals`}
            />
          </>
        )}
      </ModuleSection>

      <ModuleSection
        title="Projects"
        onViewAll={() => onNavigate('projects')}
      >
        {loading || !projects ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard
              title="Active Projects"
              value={projects.activeProjects.toLocaleString()}
              icon={KanbanSquare}
            />
            <MetricCard
              title="Tasks Due This Week"
              value={projects.tasksDueThisWeek.toLocaleString()}
              icon={CalendarClock}
              subtitle={projects.tasksOverdue > 0 ? `${projects.tasksOverdue} overdue` : undefined}
            />
          </>
        )}
      </ModuleSection>

      <ModuleSection
        title="Office"
        onViewAll={() => onNavigate('office')}
      >
        {loading || !office ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <MetricCard
              title="Company Info"
              value={office.requiredFieldsTotal === 0 ? '—' : `${office.requiredFieldsFilled}/${office.requiredFieldsTotal}`}
              icon={ClipboardCheck}
            />
            <MetricCard
              title="Office Files"
              value={office.totalFiles.toLocaleString()}
              icon={FileStack}
              subtitle={`${office.filesThisWeek} this week`}
            />
          </>
        )}
      </ModuleSection>
    </div>
  )
}

function ModuleSection({
  title,
  onViewAll,
  children,
}: {
  title: string
  onViewAll: () => void
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <button
          type="button"
          onClick={onViewAll}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View full dashboard
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}