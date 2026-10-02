'use client'

import { useMutationState, useQueryClient } from '@tanstack/react-query'
import { buildEntryPayload } from '@/lib/entries'
import { enqueueLogMetric, LOG_METRIC_MUTATION_KEY } from '@/lib/log-metric'
import type { Metric } from '@/lib/schemas'

export function useLogMetric(day: string) {
  const queryClient = useQueryClient()

  const pendingCount = useMutationState({
    filters: { mutationKey: LOG_METRIC_MUTATION_KEY, status: 'pending' },
    select: (m) => m.state.isPaused,
  }).filter(Boolean).length

  // Writes the server permanently rejected. They have already been rolled back
  // and left the queue, so without this they would vanish without a trace.
  const failedCount = useMutationState({
    filters: { mutationKey: LOG_METRIC_MUTATION_KEY, status: 'error' },
    select: (m) => m.state.status,
  }).length

  return {
    log: (metric: Metric, value: number | boolean | string) =>
      void enqueueLogMetric(queryClient, buildEntryPayload(metric, value, day)),
    pendingCount,
    failedCount,
  }
}
