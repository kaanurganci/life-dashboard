import type { Mutation, QueryClient } from '@tanstack/react-query'

/**
 * Persisting unsettled mutations is what makes the offline queue an outbox.
 * Paused alone is not enough: a weak-signal write reports online, so it sits in
 * a retry backoff as 'pending' and would be lost on reload.
 */
export function shouldDehydrateMutation(m: Mutation): boolean {
  return m.state.status === 'pending'
}

/**
 * Re-executes mutations restored from storage. A restored mutation has no
 * retryer, so continue() runs it afresh; being scoped, writes to one slot run
 * in their original order, one at a time. Mutations already running (their
 * retryer exists) are unaffected. Offline, a restored write simply pauses.
 */
export function resumeRestoredMutations(client: QueryClient): void {
  for (const m of client.getMutationCache().getAll()) {
    if (m.state.status === 'pending') void m.continue().catch(() => {})
  }
}
