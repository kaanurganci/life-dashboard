import type { MetricEntry } from '@/lib/schemas'

/** Two entries describe the same slot when metric and occurrence both match. */
function sameSlot(a: MetricEntry, b: MetricEntry): boolean {
  return a.metric_id === b.metric_id && a.occurrence === b.occurrence
}

/**
 * Places `payload` into the day's entries, replacing whatever occupied its slot.
 * Used for the optimistic update, so the UI reflects a tap immediately.
 */
export function applyOptimisticEntry(
  current: MetricEntry[],
  payload: MetricEntry,
): MetricEntry[] {
  return [...current.filter((e) => !sameSlot(e, payload)), payload]
}

/**
 * Reverts a failed write WITHOUT clobbering a newer one.
 *
 * The naive rollback — restoring the whole pre-mutation snapshot — loses data
 * when two writes to the same slot overlap: if the earlier write fails after a
 * later one succeeded, its snapshot predates the correction, so restoring it
 * silently reinstates the old value. Online, the next refetch repairs that;
 * offline, the wrong value simply persists on screen.
 *
 * So rollback is conditional. `payload` is the exact object `onMutate` inserted,
 * which makes identity the test: if the slot no longer holds that object, a
 * later write has superseded it and we leave the cache alone.
 */
export function rollbackEntry(
  current: MetricEntry[],
  payload: MetricEntry,
  previous: MetricEntry[] | undefined,
): MetricEntry[] {
  const occupant = current.find((e) => sameSlot(e, payload))

  // Superseded by a newer write (or already reconciled) — do not touch it.
  if (occupant !== payload) return current

  const restored = previous?.find((e) => sameSlot(e, payload))
  const withoutOurs = current.filter((e) => !sameSlot(e, payload))

  // Nothing was there before, so the slot returns to empty rather than to a
  // fabricated zero value — "not logged" and "logged as false" stay distinct.
  return restored ? [...withoutOurs, restored] : withoutOurs
}
