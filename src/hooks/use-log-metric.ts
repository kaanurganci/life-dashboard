'use client'

import { useMutationState, useQueryClient } from '@tanstack/react-query'
import { buildEntryPayload } from '@/lib/entries'
import { enqueueLogMetric, LOG_METRIC_MUTATION_KEY } from '@/lib/log-metric'
import type { Metric } from '@/lib/schemas'

/**
 * `day` is the day the UI is showing; `currentDay` re-derives the real day at
 * the moment of the tap. A write is only made when they agree.
 */
export function useLogMetric(day: string, currentDay: () => string) {
  const queryClient = useQueryClient()

  // Waiting means offline-paused, or sleeping in retry backoff after a failed
  // attempt (pending, not paused, failureCount > 0). A healthy in-flight write
  // is neither, so it does not flicker the badge.
  const pendingCount = useMutationState({
    filters: { mutationKey: LOG_METRIC_MUTATION_KEY, status: 'pending' },
    select: (m) => m.state.isPaused || m.state.failureCount > 0,
  }).filter(Boolean).length

  // Writes the server permanently rejected. They have already been rolled back
  // and left the queue, so without this they would vanish without a trace.
  const failedCount = useMutationState({
    filters: { mutationKey: LOG_METRIC_MUTATION_KEY, status: 'error' },
    select: (m) => m.state.status,
  }).length

  return {
    /**
     * Returns false when the tap was dropped because the day rolled over under
     * the UI. The tap's value was derived from the stale day's entries (a toggle
     * writes `!current`), so honouring it could write `false` to a day that was
     * never logged. Dropping is visible and repeatable; misrouting is neither.
     */
    log: (metric: Metric, value: number | boolean | string): boolean => {
      if (currentDay() !== day) return false
      void enqueueLogMetric(queryClient, buildEntryPayload(metric, value, day))
      return true
    },
    pendingCount,
    failedCount,
  }
}
