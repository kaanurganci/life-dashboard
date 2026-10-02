import { QueryClient } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import { get, set, del } from 'idb-keyval'

const CACHE_KEY_PREFIX = 'life-dashboard-query-cache'
/** The pre-per-user key. Holds an unknown user's data, so it is always deleted. */
const LEGACY_CACHE_KEY = CACHE_KEY_PREFIX

/**
 * Postgres codes explicitly known to be permanent. Redundant with the default
 * in isTransientError (anything unrecognised is permanent) but kept as
 * documentation, and so a future widening of the transient list cannot silently
 * re-admit them.
 */
export const PERMANENT_CODES = new Set([
  '23514', // check_violation
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '42501', // insufficient_privilege (RLS)
  'P0001', // raise_exception, i.e. our validation trigger
])

/**
 * An allowlist, not a blocklist. Transient means: no Postgres code at all (a
 * genuine transport failure; supabase-js reports those with an empty code), or
 * a class that describes the server's state rather than the data (including
 * PostgREST's 503-class cold-start codes). An expired JWT is NOT classified
 * here: writeEntry refreshes the session and retries, and treats a dead
 * session as permanent. Unknown codes
 * (PGRST*, 22xxx, 23502, auth errors...) are permanent: with the per-slot
 * mutation scope, a write that can never succeed would otherwise block its slot
 * forever.
 */
export function isTransientError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  if (code === undefined || code === null || code === '') return true
  if (typeof code !== 'string') return false
  if (PERMANENT_CODES.has(code)) return false
  return code.startsWith('08') // connection exception
    || code.startsWith('53') // insufficient resources
    || code === '57P01' // admin shutdown
    || code === '40001' // serialization failure
    || code === '40P01' // deadlock detected
    || code === '57014' // statement timeout
    || code === '55P03' // lock not available
    || /^PGRST00[0-3]$/.test(code) // db connection, pool timeout, schema cache loading
}

/** 1s, 2s, 4s ... capped at 30s. */
export function mutationRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 30_000)
}

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
        // Transient failures retry indefinitely: a weak-signal device reports
        // online so TanStack never pauses it, and a bounded retry would destroy
        // the write. Everything else leaves the queue at once.
        retry: (_failureCount: number, error: unknown) => isTransientError(error),
        retryDelay: mutationRetryDelay,
      },
    },
  })
}

/**
 * The persisted cache holds an outbox that replays under whatever session is
 * current, so it must belong to exactly one user: the key includes the user id.
 * A different account therefore never sees, and never replays, someone else's
 * queue, however the previous session ended.
 */
export function createIdbPersister(userId: string): Persister {
  const key = `${CACHE_KEY_PREFIX}:${userId}`
  return {
    persistClient: (client: PersistedClient) => set(key, client),
    restoreClient: async () => {
      // Best effort: an unreadable legacy key must not block restoring this one.
      await del(LEGACY_CACHE_KEY).catch(() => {})
      return get<PersistedClient>(key)
    },
    removeClient: () => del(key),
  }
}

/** For signed-out pages: nothing is persisted or restored. */
export const nullPersister: Persister = {
  persistClient: () => {},
  restoreClient: () => undefined,
  removeClient: () => {},
}
