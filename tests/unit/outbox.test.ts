import { describe, expect, it, afterEach } from 'vitest'
import { dehydrate, hydrate, onlineManager } from '@tanstack/react-query'
import { createQueryClient } from '@/lib/query-client'
import { registerLogMetricDefaults, enqueueLogMetric } from '@/lib/log-metric'
import { resumeRestoredMutations, shouldDehydrateMutation } from '@/lib/outbox'
import type { MetricEntry } from '@/lib/schemas'

const entry = (value: boolean): MetricEntry => ({
  metric_id: 'creatine', logged_on: '2026-09-24', occurrence: 1,
  value_num: null, value_bool: value, value_text: null,
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

afterEach(() => onlineManager.setOnline(true))

describe('resumeRestoredMutations', () => {
  it('runs each restored write exactly once, in the order they were made', async () => {
    // Session 1: two writes to one slot made offline, then persisted.
    const before = createQueryClient()
    registerLogMetricDefaults(before, async () => {})
    onlineManager.setOnline(false)
    void enqueueLogMetric(before, entry(true))
    void enqueueLogMetric(before, entry(false))
    await sleep(0)
    const persisted = JSON.parse(JSON.stringify(dehydrate(before, { shouldDehydrateMutation })))
    expect(persisted.mutations).toHaveLength(2)

    // Session 2: restored into a fresh client. The first write is slower, so
    // without per-slot ordering the second would land first.
    const executed: boolean[] = []
    const landed: boolean[] = []
    const after = createQueryClient()
    registerLogMetricDefaults(after, async (p) => {
      executed.push(p.value_bool as boolean)
      await sleep(p.value_bool ? 50 : 0)
      landed.push(p.value_bool as boolean)
    })
    hydrate(after, persisted)

    onlineManager.setOnline(true)
    resumeRestoredMutations(after)
    resumeRestoredMutations(after) // must not double-execute
    await sleep(200)

    expect(executed).toEqual([true, false])
    expect(landed).toEqual([true, false])
    expect(after.getMutationCache().getAll().every((m) => m.state.status === 'success'))
      .toBe(true)
  })

  it('persists a write that is in retry backoff, not only paused ones', async () => {
    const client = createQueryClient()
    registerLogMetricDefaults(client, async () => {
      throw new TypeError('Failed to fetch') // transient: retried forever
    })
    void enqueueLogMetric(client, entry(true))
    await sleep(20)

    const [m] = client.getMutationCache().getAll()
    expect(m.state.isPaused).toBe(false)
    expect(m.state.failureCount).toBeGreaterThan(0)
    expect(shouldDehydrateMutation(m)).toBe(true)

    client.getMutationCache().clear()
  })
})
