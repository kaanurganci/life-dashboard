import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '@/lib/query-client'
import { registerLogMetricDefaults, LOG_METRIC_MUTATION_KEY } from '@/lib/log-metric'
import { useLogMetric } from '@/hooks/use-log-metric'
import type { Metric } from '@/lib/schemas'

const creatine: Metric = {
  id: 'creatine', slug: 'creatine', label: 'Creatine', kind: 'boolean',
  category: 'supplement', unit: null, scale_min: null, scale_max: null, sort_order: 1,
}

function setup(write: () => Promise<void>, currentDay: () => string) {
  const client = createQueryClient()
  const writes: unknown[] = []
  registerLogMetricDefaults(client, async (p) => { writes.push(p); await write() })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useLogMetric('2026-09-24', currentDay), { wrapper })
  return { client, writes, hook }
}

afterEach(() => vi.restoreAllMocks())

describe('useLogMetric', () => {
  it('writes to the rendered day when it is still the real day', async () => {
    const { client, writes, hook } = setup(async () => {}, () => '2026-09-24')

    let accepted = false
    act(() => { accepted = hook.result.current.log(creatine, true) })

    expect(accepted).toBe(true)
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ logged_on: '2026-09-24' })
    client.getMutationCache().clear()
  })

  it('drops the tap, writing nothing, when the day rolled over under the UI', () => {
    const { client, writes, hook } = setup(async () => {}, () => '2026-09-25')

    let accepted = true
    act(() => { accepted = hook.result.current.log(creatine, false) })

    expect(accepted).toBe(false)
    expect(writes).toHaveLength(0)
    expect(client.getMutationCache().findAll({ mutationKey: LOG_METRIC_MUTATION_KEY }))
      .toHaveLength(0)
  })

  it('counts a write sleeping in retry backoff as waiting', async () => {
    const { client, hook } = setup(
      async () => { throw new TypeError('Failed to fetch') },
      () => '2026-09-24',
    )

    act(() => { hook.result.current.log(creatine, true) })

    await waitFor(() => expect(hook.result.current.pendingCount).toBe(1))
    expect(hook.result.current.failedCount).toBe(0)
    client.getMutationCache().clear()
  })

  it('does not count a healthy in-flight write as waiting', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const { hook } = setup(() => gate, () => '2026-09-24')

    act(() => { hook.result.current.log(creatine, true) })
    await new Promise((r) => setTimeout(r, 20))
    expect(hook.result.current.pendingCount).toBe(0)

    release()
  })
})
