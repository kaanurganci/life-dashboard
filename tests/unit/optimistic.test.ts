import { describe, expect, it } from 'vitest'
import { applyOptimisticEntry, rollbackEntry } from '@/lib/optimistic'
import type { MetricEntry } from '@/lib/schemas'

function entry(
  metric_id: string,
  value: number | boolean,
  occurrence = 1,
): MetricEntry {
  return {
    metric_id,
    logged_on: '2026-09-24',
    occurrence,
    value_num: typeof value === 'number' ? value : null,
    value_bool: typeof value === 'boolean' ? value : null,
    value_text: null,
  }
}

describe('applyOptimisticEntry', () => {
  it('adds an entry to an empty day', () => {
    const next = applyOptimisticEntry([], entry('sleep', 7))
    expect(next).toHaveLength(1)
    expect(next[0].value_num).toBe(7)
  })

  it('replaces the entry occupying the same slot', () => {
    const next = applyOptimisticEntry([entry('sleep', 7)], entry('sleep', 9))
    expect(next).toHaveLength(1)
    expect(next[0].value_num).toBe(9)
  })

  it('leaves other metrics alone', () => {
    const next = applyOptimisticEntry(
      [entry('creatine', true), entry('sleep', 7)],
      entry('sleep', 9),
    )
    expect(next).toHaveLength(2)
    expect(next.find((e) => e.metric_id === 'creatine')?.value_bool).toBe(true)
  })

  it('treats a different occurrence as a different slot', () => {
    const next = applyOptimisticEntry(
      [entry('sleep', 7, 1)],
      entry('sleep', 9, 2),
    )
    expect(next).toHaveLength(2)
  })
})

describe('rollbackEntry', () => {
  it('restores the previous value when the write is not superseded', () => {
    const previousEntry = entry('sleep', 6)
    const failed = entry('sleep', 9)
    const current = [failed]

    const next = rollbackEntry(current, failed, [previousEntry])

    expect(next).toHaveLength(1)
    expect(next[0].value_num).toBe(6)
  })

  it('empties the slot when nothing was logged before', () => {
    const failed = entry('sleep', 9)

    const next = rollbackEntry([failed], failed, [])

    expect(next).toHaveLength(0)
  })

  // The race this whole module exists for.
  it('does NOT clobber a newer write to the same slot', () => {
    const previousEntry = entry('sleep', 6)
    const failedEarlier = entry('sleep', 7)
    const succeededLater = entry('sleep', 9)

    // The later write already replaced ours in the cache.
    const current = [succeededLater]

    const next = rollbackEntry(current, failedEarlier, [previousEntry])

    expect(next).toHaveLength(1)
    expect(next[0].value_num).toBe(9)
  })

  it('does not clobber a newer write even when nothing was logged before', () => {
    const failedEarlier = entry('creatine', true)
    const succeededLater = entry('creatine', false)

    const next = rollbackEntry([succeededLater], failedEarlier, [])

    expect(next).toHaveLength(1)
    expect(next[0].value_bool).toBe(false)
  })

  it('leaves other metrics untouched while reverting one', () => {
    const other = entry('creatine', true)
    const failed = entry('sleep', 9)

    const next = rollbackEntry([other, failed], failed, [])

    expect(next).toHaveLength(1)
    expect(next[0].metric_id).toBe('creatine')
  })

  it('preserves a logged false rather than dropping it to empty', () => {
    const previousFalse = entry('creatine', false)
    const failed = entry('creatine', true)

    const next = rollbackEntry([failed], failed, [previousFalse])

    expect(next).toHaveLength(1)
    expect(next[0].value_bool).toBe(false)
  })
})
