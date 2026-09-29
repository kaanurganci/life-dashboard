'use client'

import { useMutation, useMutationState, useQueryClient }
  from '@tanstack/react-query'
import { buildEntryPayload } from '@/lib/entries'
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

      queryClient.setQueryData<MetricEntry[]>(['entries', day], (old = []) => {
        const rest = old.filter(
          (e) => !(e.metric_id === payload.metric_id
                   && e.occurrence === payload.occurrence),
        )
        return [...rest, payload]
      })

      return { previous }
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['entries', day], context.previous)
      }
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
