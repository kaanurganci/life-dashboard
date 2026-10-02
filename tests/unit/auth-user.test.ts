import { describe, expect, it } from 'vitest'
import { AuthSessionMissingError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { resolveUserId } from '@/lib/auth-user'

function fake(getUser: () => Promise<unknown>, getSession?: () => Promise<unknown>) {
  return {
    auth: {
      getUser, getSession: getSession ?? (async () => ({ data: { session: null } })),
    },
  } as never
}

describe('resolveUserId', () => {
  it('returns the user id', async () => {
    const id = await resolveUserId(fake(async () => ({ data: { user: { id: 'u1' } }, error: null })))
    expect(id).toBe('u1')
  })

  it('returns null only for a CONFIRMED signed-out state', async () => {
    expect(await resolveUserId(fake(async () => ({
      data: { user: null }, error: new AuthSessionMissingError(),
    })))).toBeNull()
    expect(await resolveUserId(fake(async () => ({ data: { user: null }, error: null }))))
      .toBeNull()
  })

  it('a failed lookup falls back to the session cookie user, never to signed-out', async () => {
    const id = await resolveUserId(fake(
      async () => ({ data: { user: null }, error: new AuthRetryableFetchError('down', 0) }),
      async () => ({ data: { session: { user: { id: 'u1' } } } }),
    ))
    expect(id).toBe('u1')
  })

  it('a failed lookup with nothing to fall back on is unknown (undefined), not null', async () => {
    expect(await resolveUserId(fake(async () => ({
      data: { user: null }, error: new AuthRetryableFetchError('down', 0),
    })))).toBeUndefined()
    expect(await resolveUserId(fake(async () => { throw new Error('boom') }))).toBeUndefined()
  })
})
