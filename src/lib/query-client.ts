import { QueryClient } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import { get, set, del } from 'idb-keyval'

const CACHE_KEY = 'life-dashboard-query-cache'

/** Postgres error classes that will never succeed on a retry. */
const PERMANENT_CODES = new Set([
  '23514', // check_violation
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '42501', // insufficient_privilege (RLS)
  'P0001', // raise_exception, i.e. our validation trigger
])

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: 2,
        refetchOnWindowFocus: true,
        // Queries are persisted to IndexedDB alongside the mutation queue, so a
        // restored result can be served instantly — which is what makes the app
        // usable with no signal. But a restored result inside its staleTime window
        // is treated as fresh and never refetched, so a registry change made
        // elsewhere (seeding metrics, adding a supplement in the dashboard) stayed
        // invisible for up to an hour, surviving even a hard refresh because
        // IndexedDB does. 'always' keeps the instant paint from cache and
        // revalidates in the background on every mount.
        refetchOnMount: 'always',
      },
      mutations: {
        gcTime: 1000 * 60 * 60 * 24 * 7,
        // A rejected write must leave the queue; only transport failures wait
        // for reconnection.
        retry: (failureCount: number, error: unknown) => {
          const code = (error as { code?: string } | null)?.code
          if (code && PERMANENT_CODES.has(code)) return false
          return failureCount < 3
        },
      },
    },
  })
}

export const idbPersister: Persister = {
  persistClient: (client: PersistedClient) => set(CACHE_KEY, client),
  restoreClient: () => get<PersistedClient>(CACHE_KEY),
  removeClient: () => del(CACHE_KEY),
}
