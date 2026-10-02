import { describe, expect, it, vi } from 'vitest'
import { AuthRetryableFetchError, AuthApiError } from '@supabase/supabase-js'
import { writeEntry, SIGNED_OUT_CODE } from '@/lib/write-entry'
import { isTransientError } from '@/lib/query-client'
import type { MetricEntry } from '@/lib/schemas'

const payload: MetricEntry = {
  metric_id: 'creatine', logged_on: '2026-09-24', occurrence: 1,
  value_num: null, value_bool: true, value_text: null,
}

type Result = { error: { code?: string; message: string } | null; status: number }
const ok: Result = { error: null, status: 201 }
const expired: Result = { error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 }

function fakeSupabase(upserts: Result[], refresh: () => Promise<unknown>) {
  const upsert = vi.fn(async () => upserts.shift()!)
  const refreshSession = vi.fn(refresh)
  const client = {
    from: () => ({ upsert }),
    auth: { refreshSession },
  }
  return { client: client as never, upsert, refreshSession }
}

const refreshed = async () => ({ data: { session: { access_token: 'new' } }, error: null })

describe('writeEntry', () => {
  it('writes straight through when the token is fine', async () => {
    const { client, upsert, refreshSession } = fakeSupabase([ok], refreshed)
    await writeEntry(client, payload)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it('refreshes an expired token and retries the write once, instead of deleting it', async () => {
    const { client, upsert, refreshSession } = fakeSupabase([expired, ok], refreshed)
    await writeEntry(client, payload)
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it('treats a bare 401 as an expired token too', async () => {
    const { client, refreshSession } = fakeSupabase(
      [{ error: { message: 'Unauthorized' }, status: 401 }, ok], refreshed)
    await writeEntry(client, payload)
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('a refresh that fails on transport is retryable, not a verdict', async () => {
    const { client } = fakeSupabase([expired], async () => ({
      data: { session: null },
      error: new AuthRetryableFetchError('network down', 0),
    }))
    const err = await writeEntry(client, payload).catch((e) => e)
    expect(isTransientError(err)).toBe(true)
  })

  it('a refresh refused by the auth server means signed out: permanent', async () => {
    const { client } = fakeSupabase([expired], async () => ({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
    }))
    const err = await writeEntry(client, payload).catch((e) => e)
    expect(err.code).toBe(SIGNED_OUT_CODE)
    expect(isTransientError(err)).toBe(false)
  })

  it('does not spin: still rejected after a refresh is permanent', async () => {
    const { client, upsert } = fakeSupabase([expired, expired], refreshed)
    const err = await writeEntry(client, payload).catch((e) => e)
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(isTransientError(err)).toBe(false)
  })

  it('a constraint violation is thrown without any refresh', async () => {
    const { client, refreshSession } = fakeSupabase(
      [{ error: { code: '23514', message: 'check' }, status: 400 }], refreshed)
    const err = await writeEntry(client, payload).catch((e) => e)
    expect(refreshSession).not.toHaveBeenCalled()
    expect(isTransientError(err)).toBe(false)
  })
})
