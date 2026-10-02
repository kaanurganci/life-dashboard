'use client'

import { useEffect, useState } from 'react'
import { previousDay } from '@/lib/date'
import { valueOf } from '@/lib/entries'
import { useDayLog } from '@/hooks/use-day-log'
import { useToday } from '@/hooks/use-today'
import { useLogMetric } from '@/hooks/use-log-metric'
import { MetricToggle } from '@/components/metric-toggle'
import { MetricSlider } from '@/components/metric-slider'
import { SameAsYesterday } from '@/components/same-as-yesterday'
import { PendingBadge, FailedBadge } from '@/components/pending-badge'

export function MorningCard({
  initialDay, timeZone,
}: { initialDay: string; timeZone: string }) {
  const { day, refresh } = useToday(initialDay, timeZone)
  const { metrics, entries, isLoading } = useDayLog(day)
  const { entries: yesterdayEntries } = useDayLog(previousDay(day))
  const { log, pendingCount, failedCount } = useLogMetric(day, refresh)
  const [rolledOver, setRolledOver] = useState(false)

  // A tap dropped because the day changed under the UI must not be silent.
  useEffect(() => {
    if (!rolledOver) return
    const t = setTimeout(() => setRolledOver(false), 5000)
    return () => clearTimeout(t)
  }, [rolledOver])

  const tap: typeof log = (metric, value) => {
    const accepted = log(metric, value)
    setRolledOver(!accepted)
    return accepted
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-neutral-500">Loading…</p>
  }

  const scales = metrics.filter((m) => m.kind === 'scale')
  const habits = metrics.filter((m) => m.kind === 'boolean')
  const done = habits.filter((m) => valueOf(m, entries.get(m.id)) === true).length

  function copyYesterday() {
    for (const habit of habits) {
      if (valueOf(habit, yesterdayEntries.get(habit.id)) === true) {
        // Day changed: every remaining tap would be dropped too.
        if (!tap(habit, true)) return
      }
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Today</h2>
        <div className="flex items-center gap-2">
          <FailedBadge count={failedCount} />
          <PendingBadge count={pendingCount} />
          <span className="text-sm tabular-nums text-neutral-500">
            {done} / {habits.length}
          </span>
        </div>
      </header>

      {rolledOver && (
        <p aria-live="polite" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          New day — tap again.
        </p>
      )}

      {scales.map((metric) => (
        <MetricSlider
          key={metric.id}
          metric={metric}
          value={valueOf(metric, entries.get(metric.id)) as number | null}
          onChange={(next) => tap(metric, next)}
        />
      ))}

      <SameAsYesterday onClick={copyYesterday} />

      {habits.map((metric) => (
        <MetricToggle
          key={metric.id}
          metric={metric}
          value={valueOf(metric, entries.get(metric.id)) === true}
          onChange={(next) => tap(metric, next)}
        />
      ))}
    </section>
  )
}
