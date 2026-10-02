import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, onlineManager, dehydrate, hydrate } from '@tanstack/react-query'
import {
  enqueueLogMetric, registerLogMetricDefaults, LOG_METRIC_MUTATION_KEY,
} from '@/lib/log-metric'
import { createQueryClient } from '@/lib/query-client'
import type { MetricEntry } from '@/lib/schemas'

const entry = (metric_id: string, value: boolean, logged_on = '2026-09-24'): MetricEntry => ({
  metric_id, logged_on, occurrence: 1,
  value_num: null, value_bool: value, value_text: null,
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

afterEach(() => onlineManager.setOnline(true))

describe('write ordering per slot', () => {
  let db: Map<string, boolean | null>
  let client: QueryClient

  // The server applies whatever arrives LAST. Latency is per call so a test can
  // make an earlier write slower than a later one -- the race on reconnect.
  function setup(latency: (p: MetricEntry, n: number) => number) {
    db = new Map()
    client = createQueryClient()
    let n = 0
    registerLogMetricDefaults(client, async (p) => {
      await sleep(latency(p, n++))
      db.set(`${p.metric_id}:${p.logged_on}`, p.value_bool)
    })
  }

  it('the last write wins even when an earlier one is slower', async () => {
    setup((_p, n) => (n === 0 ? 60 : 0)) // first write is slow
    await Promise.all([
      enqueueLogMetric(client, entry('creatine', true)),
      enqueueLogMetric(client, entry('creatine', false)),
    ])
    expect(db.get('creatine:2026-09-24')).toBe(false)
  })

  it('replays offline writes to one slot in the order they were made', async () => {
    setup((_p, n) => (n === 0 ? 60 : 0))
    onlineManager.setOnline(false)
    const writes = [
      enqueueLogMetric(client, entry('creatine', true)),
      enqueueLogMetric(client, entry('creatine', false)),
    ]
    await sleep(10)
    expect(db.size).toBe(0)

    onlineManager.setOnline(true)
    await client.resumePausedMutations()
    await Promise.all(writes)

    expect(db.get('creatine:2026-09-24')).toBe(false)
  })

  it('does not serialise different slots behind one another', async () => {
    db = new Map()
    client = createQueryClient()
    let release!: () => void
    const stuck = new Promise<void>((r) => { release = r })
    registerLogMetricDefaults(client, async (p) => {
      if (p.metric_id === 'stuck') await stuck
      db.set(`${p.metric_id}:${p.logged_on}`, p.value_bool)
    })

    const blocked = enqueueLogMetric(client, entry('stuck', true))
    await enqueueLogMetric(client, entry('creatine', true))
    await enqueueLogMetric(client, entry('creatine', true, '2026-09-25'))

    expect(db.get('creatine:2026-09-24')).toBe(true)
    expect(db.get('creatine:2026-09-25')).toBe(true)
    expect(db.has('stuck:2026-09-24')).toBe(false)

    release()
    await blocked
  })
})

describe('callbacks survive a reload', () => {
  it('a restored mutation refreshes the entries it touched when it lands', async () => {
    // Session 1: a write is made offline and persisted.
    const before = createQueryClient()
    registerLogMetricDefaults(before, async () => {})
    onlineManager.setOnline(false)
    void enqueueLogMetric(before, entry('creatine', true))
    await sleep(0)
    const persisted = JSON.parse(JSON.stringify(
      dehydrate(before, { shouldDehydrateMutation: (m) => m.state.status === 'pending' }),
    ))
    expect(persisted.mutations).toHaveLength(1)
    expect(persisted.mutations[0].scope?.id).toContain('creatine')

    // Session 2: fresh client, defaults registered, state restored.
    const after = createQueryClient()
    registerLogMetricDefaults(after, async () => {})
    const invalidate = vi.spyOn(after, 'invalidateQueries')
    hydrate(after, persisted)

    onlineManager.setOnline(true)
    const [restored] = after.getMutationCache().getAll()
    await restored.continue()

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['entries', '2026-09-24'] })
    expect(restored.state.status).toBe('success')
  })
})

describe('failures', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

  it('a permanent rejection leaves the queue, rolls back, and is counted as failed', async () => {
    const client = createQueryClient()
    registerLogMetricDefaults(client, async () => {
      throw Object.assign(new Error('check'), { code: '23514' })
    })
    client.setQueryData(['entries', '2026-09-24'], [])

    await enqueueLogMetric(client, entry('creatine', true))

    expect(client.getQueryData(['entries', '2026-09-24'])).toEqual([])
    expect(client.getMutationCache()
      .findAll({ mutationKey: LOG_METRIC_MUTATION_KEY, status: 'error' })).toHaveLength(1)
  })

  it('a later successful write to the slot clears its earlier failure', async () => {
    const client = createQueryClient()
    let fail = true
    registerLogMetricDefaults(client, async () => {
      if (fail) throw Object.assign(new Error('rls'), { code: '42501' })
    })

    await enqueueLogMetric(client, entry('creatine', true))
    fail = false
    await enqueueLogMetric(client, entry('creatine', true))

    expect(client.getMutationCache()
      .findAll({ mutationKey: LOG_METRIC_MUTATION_KEY, status: 'error' })).toHaveLength(0)
  })
})
