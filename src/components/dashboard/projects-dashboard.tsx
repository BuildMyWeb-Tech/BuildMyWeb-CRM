"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { KanbanSquare, CalendarClock, AlertTriangle, ListTodo, Plus } from 'lucide-react'

import { loadProjectsMetrics, loadProjectsActivity } from '@/lib/dashboard/queries'
import type { ActivityItem, ProjectsMetrics } from '@/lib/dashboard/types'

import { MetricCard } from './metric-card'
import { SkeletonCard } from './skeleton'
import { ActivityFeed } from './activity-feed'

// Advanced dashboard for the Projects module — metric cards, a
// shortcut to create a project, and a recent-activity feed scoped
// to project/task events (reuses the same ActivityFeed component
// Sales uses, just fed project-flavoured items).
export function ProjectsDashboard() {
  const [metrics, setMetrics] = useState<ProjectsMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()
    void loadProjectsMetrics(db)
      .then(setMetrics)
      .catch((err) => console.error('[projects-dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))
    void loadProjectsActivity(db, 50)
      .then(setActivity)
      .catch((err) => console.error('[projects-dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Active projects, task load, and what's coming due.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title="Active Projects"
              value={metrics.activeProjects.toLocaleString()}
              icon={KanbanSquare}
            />
            <MetricCard
              title="Tasks Due This Week"
              value={metrics.tasksDueThisWeek.toLocaleString()}
              icon={CalendarClock}
            />
            <MetricCard
              title="Overdue Tasks"
              value={metrics.tasksOverdue.toLocaleString()}
              icon={AlertTriangle}
            />
            <MetricCard
              title="Total Open Tasks"
              value={metrics.totalTasks.toLocaleString()}
              icon={ListTodo}
            />
          </>
        )}
      </div>

      {/* Shortcut — mirrors Sales' QuickActions philosophy: link to
          where the actual "create" flow lives rather than trying to
          trigger it from here. */}
      <Link
        href="/projects"
        className="group flex w-fit items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-border hover:bg-muted/60"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-primary">
          <Plus className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium text-foreground">New Project</span>
      </Link>

      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}