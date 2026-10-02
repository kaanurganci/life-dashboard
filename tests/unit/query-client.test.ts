import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createQueryClient, createIdbPersister, isTransientError, mutationRetryDelay,
  PERMANENT_CODES,
} from '@/lib/query-client'

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

  // The default must be "give up": with the per-slot scope, a write that can
  // never succeed would otherwise block its habit permanently.
  it.each(['PGRST116', 'PGRST301', '22P02', '22003', '23502', '28000', 'XX000', 'refresh_token_not_found'])(
    'treats an unrecognised code (%s) as permanent', (code) => {
      expect(isTransientError(Object.assign(new Error('x'), { code }))).toBe(false)
      const retry = createQueryClient().getDefaultOptions().mutations?.retry as
        (n: number, e: Error) => boolean
      expect(retry(0, Object.assign(new Error('x'), { code }))).toBe(false)
    })

  it.each(['08000', '08006', '53300', '57P01', '40001', '40P01'])(
    'treats %s as transient', (code) => {
      expect(isTransientError(Object.assign(new Error('x'), { code }))).toBe(true)
    })

  it('treats no code, or the empty code supabase-js gives a fetch failure, as transient', () => {
    expect(isTransientError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransientError(Object.assign(new Error('x'), { code: '' }))).toBe(true)
    expect(isTransientError(null)).toBe(true)
  })

  // Cold start of a paused free-tier project, and slow-but-healthy queries.
  it.each(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '57014', '55P03'])(
    'treats the cold-start/timeout code %s as transient', (code) => {
      expect(isTransientError(Object.assign(new Error('x'), { code }))).toBe(true)
    })

  it('still gives up on a genuine constraint violation, and on PGRST004+', () => {
    for (const code of ['23514', '23505', 'P0001', 'PGRST004', 'PGRST100']) {
      expect(isTransientError(Object.assign(new Error('x'), { code }))).toBe(false)
    }
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

describe('createIdbPersister', () => {
  beforeEach(() => store.clear())
  const blob = (timestamp: number) => ({
    buster: '', timestamp, clientState: { mutations: [], queries: [] },
  })

  it('round-trips a client through IndexedDB', async () => {
    const p = createIdbPersister('user-a')
    await p.persistClient(blob(1))
    expect((await p.restoreClient())?.timestamp).toBe(1)
  })

  it('removes the stored client', async () => {
    const p = createIdbPersister('user-a')
    await p.persistClient(blob(2))
    await p.removeClient()
    expect(await p.restoreClient()).toBeUndefined()
  })

  it('never lets one user restore another account cache or outbox', async () => {
    await createIdbPersister('user-a').persistClient(blob(3))
    expect(await createIdbPersister('user-b').restoreClient()).toBeUndefined()
  })

  it('deletes the legacy global key rather than serving it to anyone', async () => {
    store.set('life-dashboard-query-cache', blob(4))
    expect(await createIdbPersister('user-a').restoreClient()).toBeUndefined()
    expect(store.has('life-dashboard-query-cache')).toBe(false)
  })
})
