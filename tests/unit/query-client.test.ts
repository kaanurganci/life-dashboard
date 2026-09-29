import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createQueryClient, idbPersister } from '@/lib/query-client'

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

  it('stops retrying after three attempts', () => {
    const client = createQueryClient()
    const retry = client.getDefaultOptions().mutations?.retry as
      (n: number, e: Error) => boolean

    expect(retry(3, new TypeError('Failed to fetch'))).toBe(false)
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
