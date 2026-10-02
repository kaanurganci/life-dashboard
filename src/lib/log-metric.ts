import type { QueryClient } from '@tanstack/react-query'
import { applyOptimisticEntry, rollbackEntry } from '@/lib/optimistic'
import type { MetricEntry } from '@/lib/schemas'

export const LOG_METRIC_MUTATION_KEY = ['log-metric']

type Context = { previous?: MetricEntry[] }

/**
 * One scope per (metric, day, occurrence). TanStack runs mutations that share a
 * scope id strictly one at a time, in creation order, and that order survives a
 * reload because the scope is dehydrated with the mutation. Writes to different
 * slots stay fully parallel, so one stuck write never blocks another habit.
 */
export function slotScopeId(p: MetricEntry): string {
  return `slot:${p.metric_id}:${p.logged_on}:${p.occurrence}`
}

function sameSlot(a: MetricEntry, b: MetricEntry): boolean {
  return a.metric_id === b.metric_id && a.logged_on === b.logged_on
    && a.occurrence === b.occurrence
}

/**
 * Registers everything a log-metric mutation needs, keyed by mutation key.
 * Callbacks live here rather than in a hook because a mutation restored from
 * IndexedDB carries only its key and variables: anything defined in a component
 * would be missing exactly when an offline write finally lands. The day is read
 * from the payload, so the callbacks need no component state.
 */
export function registerLogMetricDefaults(
  client: QueryClient,
  write: (payload: MetricEntry) => Promise<void>,
) {
  client.setMutationDefaults(LOG_METRIC_MUTATION_KEY, {
    mutationFn: write,

    onMutate: async (payload: MetricEntry): Promise<Context> => {
      const key = ['entries', payload.logged_on]
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<MetricEntry[]>(key)
      client.setQueryData<MetricEntry[]>(key, (old = []) =>
        applyOptimisticEntry(old, payload))
      return { previous }
    },

    // Reverts only this write's own slot, and only if a later write has not
    // already replaced it (see rollbackEntry).
    onError: (_error: Error, payload: MetricEntry, context: Context | undefined) => {
      client.setQueryData<MetricEntry[]>(['entries', payload.logged_on],
        (current = []) => rollbackEntry(current, payload, context?.previous))
    },

    // A successful write supersedes any earlier failure for the same slot, so
    // the "failed to save" count does not outlive the problem it reported.
    onSuccess: (_data: void, payload: MetricEntry) => {
      const cache = client.getMutationCache()
      for (const m of cache.findAll({ mutationKey: LOG_METRIC_MUTATION_KEY, status: 'error' })) {
        if (sameSlot(m.state.variables as MetricEntry, payload)) cache.remove(m)
      }
    },

    // Runs for restored mutations too, so a write that lands after a reload
    // refreshes the view instead of leaving a stale server value on screen.
    onSettled: (_data: void | undefined, _error: Error | null, payload: MetricEntry) => {
      void client.invalidateQueries({ queryKey: ['entries', payload.logged_on] })
      // No query uses this key yet; kept for the planned daily-summary view so
      // that view is refreshed by writes from the moment it exists.
      void client.invalidateQueries({ queryKey: ['daily-summary'] })
    },
  })
}

/**
 * Enqueues a write. Built imperatively because `scope` must vary per call and
 * `useMutation` reads it once at definition time.
 */
export function enqueueLogMetric(client: QueryClient, payload: MetricEntry): Promise<void> {
  const mutation = client.getMutationCache().build<void, Error, MetricEntry, Context>(
    client,
    {
      mutationKey: LOG_METRIC_MUTATION_KEY,
      scope: { id: slotScopeId(payload) },
    },
  )
  // Failure is surfaced through the failed-writes count, not as a rejection.
  return mutation.execute(payload).then(() => undefined, () => undefined)
}
