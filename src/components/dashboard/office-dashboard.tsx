"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Building2, FileStack, Folder, ClipboardCheck } from 'lucide-react'

import { loadOfficeMetrics, loadOfficeActivity } from '@/lib/dashboard/queries'
import type { ActivityItem, OfficeMetrics } from '@/lib/dashboard/types'

import { MetricCard } from './metric-card'
import { SkeletonCard } from './skeleton'
import { ActivityFeed } from './activity-feed'

// Advanced dashboard for the Office module — company info
// completeness, file counts, shortcuts into each Office tab, and a
// recent-uploads feed. Bills aren't tracked separately (Phase 4 —
// they're just PDFs in Files), so there's no bills metric here.
export function OfficeDashboard() {
  const [metrics, setMetrics] = useState<OfficeMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()
    void loadOfficeMetrics(db)
      .then(setMetrics)
      .catch((err) => console.error('[office-dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))
    void loadOfficeActivity(db, 50)
      .then(setActivity)
      .catch((err) => console.error('[office-dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const completenessLabel = metrics
    ? metrics.requiredFieldsTotal === 0
      ? 'No required fields set'
      : `${metrics.requiredFieldsFilled}/${metrics.requiredFieldsTotal} required fields filled`
    : ''

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Office</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Company info status and file activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title="Company Info"
              value={
                metrics.requiredFieldsTotal === 0
                  ? '—'
                  : `${metrics.requiredFieldsFilled}/${metrics.requiredFieldsTotal}`
              }
              icon={ClipboardCheck}
              subtitle={completenessLabel}
            />
            <MetricCard
              title="Office Files"
              value={metrics.totalFiles.toLocaleString()}
              icon={FileStack}
              subtitle={`${metrics.filesThisWeek} uploaded this week`}
            />
          </>
        )}
      </div>

      {/* Shortcuts into each Office tab — office/page.tsx reads
          ?tab= on load to jump straight to the right one. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          href="/office?tab=info"
          className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-border hover:bg-muted/60"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-foreground">Company Info</span>
        </Link>
        <Link
          href="/office?tab=files"
          className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-border hover:bg-muted/60"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-primary">
            <Folder className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-foreground">Open Files</span>
        </Link>
      </div>

      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}