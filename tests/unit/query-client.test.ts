import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createQueryClient, idbPersister, mutationRetryDelay, PERMANENT_CODES } from '@/lib/query-client'

const store = new Map<string, unknown>()

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => { store.set(k, v) }),
  del: vi.fn(async (k: string) => { store.delete(k) }),
}))

describe('createQueryClient', () => {
  it('does not retry a constraint violation', () => {
    const client = createQueryClient()
    const retry = client.getDefaultOptions().mutations?.retry

    expect(typeof retry).toBe('function')
    const shouldRetry = (retry as (n: number, e: Error) => boolean)(
      0, Object.assign(new Error('check_violation'), { code: '23514' }),
    )
    expect(shouldRetry).toBe(false)
  })

  it('retries a network failure', () => {
    const client = createQueryClient()
    const retry = client.getDefaultOptions().mutations?.retry as
      (n: number, e: Error) => boolean

    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true)
  })

  // Weak signal reports online, so TanStack never pauses; a bounded retry would
  // destroy the write. Transport errors must wait it out, however long.
  it('retries a network failure indefinitely', () => {
    const retry = createQueryClient().getDefaultOptions().mutations?.retry as
      (n: number, e: Error) => boolean

    expect(retry(3, new TypeError('Failed to fetch'))).toBe(true)
    expect(retry(500, new TypeError('Failed to fetch'))).toBe(true)
  })

  it.each([...PERMANENT_CODES])('drops a %s rejection immediately', (code) => {
    const retry = createQueryClient().getDefaultOptions().mutations?.retry as
      (n: number, e: Error) => boolean

    expect(retry(0, Object.assign(new Error('rejected'), { code }))).toBe(false)
    expect(retry(50, Object.assign(new Error('rejected'), { code }))).toBe(false)
  })

  it('backs off exponentially, capped at 30 seconds', () => {
    expect(mutationRetryDelay(0)).toBe(1000)
    expect(mutationRetryDelay(1)).toBe(2000)
    expect(mutationRetryDelay(4)).toBe(16_000)
    expect(mutationRetryDelay(5)).toBe(30_000)
    expect(mutationRetryDelay(1000)).toBe(30_000)
    expect(createQueryClient().getDefaultOptions().mutations?.retryDelay)
      .toBe(mutationRetryDelay)
  })

  // Regression guard: without this, a query restored from IndexedDB inside its
  // staleTime window is treated as fresh and never refetched, so registry changes
  // stay invisible for up to an hour and survive a hard refresh.
  it('always revalidates a restored query on mount', () => {
    const client = createQueryClient()
    expect(client.getDefaultOptions().queries?.refetchOnMount).toBe('always')
  })
})

describe('idbPersister', () => {
  beforeEach(() => store.clear())

  it('round-trips a client through IndexedDB', async () => {
    await idbPersister.persistClient({
      buster: '', timestamp: 1, clientState: {
        mutations: [], queries: [],
      },
    })

    const restored = await idbPersister.restoreClient()
    expect(restored?.timestamp).toBe(1)
  })

  it('removes the stored client', async () => {
    await idbPersister.persistClient({
      buster: '', timestamp: 2, clientState: { mutations: [], queries: [] },
    })
    await idbPersister.removeClient()

    expect(await idbPersister.restoreClient()).toBeUndefined()
  })
})
