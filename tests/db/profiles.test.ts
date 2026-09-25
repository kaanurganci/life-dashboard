import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, clientFor, createTestUser, deleteTestUsers, type TestUser }
  from './helpers'

describe('profiles', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser()
    bob = await createTestUser()
  })

  afterAll(async () => {
    await deleteTestUsers(alice, bob)
  })

  it('creates a profile automatically on signup', async () => {
    const { data, error } = await admin
      .from('profiles').select('id, timezone').eq('id', alice.id).single()

    expect(error).toBeNull()
    expect(data?.id).toBe(alice.id)
    expect(data?.timezone).toBe('Europe/London')
  })

  it('lets a user read their own profile', async () => {
    const { data } = await clientFor(alice).from('profiles').select('id')
    expect(data).toHaveLength(1)
    expect(data?.[0].id).toBe(alice.id)
  })

  it('hides other users behind RLS', async () => {
    const { data } = await clientFor(bob).from('profiles').select('id')
    expect(data).toHaveLength(1)
    expect(data?.[0].id).toBe(bob.id)
    expect(data?.[0].id).not.toBe(alice.id)
  })

  it('refuses a write targeting another user', async () => {
    const { error } = await clientFor(bob)
      .from('profiles').update({ display_name: 'hacked' }).eq('id', alice.id)
    const { data } = await admin
      .from('profiles').select('display_name').eq('id', alice.id).single()

    expect(data?.display_name).not.toBe('hacked')
    expect(error === null || error.code === '42501').toBe(true)
  })
})
