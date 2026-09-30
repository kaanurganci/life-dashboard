'use client'

import { useMutation, useMutationState, useQueryClient }
  from '@tanstack/react-query'
import { buildEntryPayload } from '@/lib/entries'
import { applyOptimisticEntry, rollbackEntry } from '@/lib/optimistic'
import type { Metric, MetricEntry } from '@/lib/schemas'

export const LOG_METRIC_MUTATION_KEY = ['log-metric']

export function useLogMetric(day: string) {
  const queryClient = useQueryClient()

  const mutation = useMutation<void, Error, MetricEntry, { previous?: MetricEntry[] }>({
    mutationKey: LOG_METRIC_MUTATION_KEY,
    // mutationFn comes from setMutationDefaults in Providers, so a mutation
    // restored from IndexedDB after a reload still knows how to run.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['entries', day] })
      const previous = queryClient.getQueryData<MetricEntry[]>(['entries', day])

      queryClient.setQueryData<MetricEntry[]>(['entries', day], (old = []) =>
        applyOptimisticEntry(old, payload))

      return { previous }
    },
    // Reverts only this write's own slot, and only if a later write has not
    // already replaced it. Restoring the whole snapshot would lose a correction
    // made while this write was still in flight — invisible online, because the
    // next refetch repairs it, but persistent offline.
    onError: (_error, payload, context) => {
      queryClient.setQueryData<MetricEntry[]>(['entries', day], (current = []) =>
        rollbackEntry(current, payload, context?.previous))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries', day] })
      void queryClient.invalidateQueries({ queryKey: ['daily-summary'] })
    },
  })

  const pendingCount = useMutationState({
    filters: { mutationKey: LOG_METRIC_MUTATION_KEY, status: 'pending' },
    select: (m) => m.state.isPaused,
  }).filter(Boolean).length

  return {
    log: (metric: Metric, value: number | boolean | string) =>
      mutation.mutate(buildEntryPayload(metric, value, day)),
    pendingCount,
  }
}
