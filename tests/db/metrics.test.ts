import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientFor, createTestUser, deleteTestUsers, type TestUser }
  from './helpers'

describe('metrics registry', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser()
    bob = await createTestUser()
  })

  afterAll(async () => {
    await deleteTestUsers(alice, bob)
  })

  it('defaults user_id to the caller', async () => {
    const { data, error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'creatine', label: 'Creatine', kind: 'boolean',
                category: 'supplement' })
      .select('user_id, is_active, sort_order').single()

    expect(error).toBeNull()
    expect(data?.user_id).toBe(alice.id)
    expect(data?.is_active).toBe(true)
    expect(data?.sort_order).toBe(0)
  })

  it('rejects a scale metric with no bounds', async () => {
    const { error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'mood', label: 'Mood', kind: 'scale', category: 'wellbeing' })

    expect(error?.code).toBe('23514')            // check_violation
    expect(error?.message).toContain('scale_bounds_present')
  })

  it('rejects inverted scale bounds', async () => {
    const { error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'mood2', label: 'Mood', kind: 'scale', category: 'wellbeing',
                scale_min: 10, scale_max: 1 })

    expect(error?.code).toBe('23514')
  })

  it('accepts a well-formed scale metric', async () => {
    const { error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'sleep_quality', label: 'Sleep Quality', kind: 'scale',
                category: 'wellbeing', scale_min: 1, scale_max: 10 })

    expect(error).toBeNull()
  })

  it('rejects a duplicate slug for the same user', async () => {
    const { error } = await clientFor(alice).from('metrics')
      .insert({ slug: 'creatine', label: 'Creatine again', kind: 'boolean',
                category: 'supplement' })

    expect(error?.code).toBe('23505')            // unique_violation
  })

  it('allows the same slug for a different user', async () => {
    const { error } = await clientFor(bob).from('metrics')
      .insert({ slug: 'creatine', label: 'Creatine', kind: 'boolean',
                category: 'supplement' })

    expect(error).toBeNull()
  })

  it('refuses an insert claiming another user', async () => {
    const { error } = await clientFor(bob).from('metrics')
      .insert({ user_id: alice.id, slug: 'smuggled', label: 'Smuggled',
                kind: 'boolean', category: 'habit' })

    expect(error?.code).toBe('42501')            // RLS check violation
  })

  it("hides another user's metrics from a select", async () => {
    // At this point alice has 2 rows (creatine, sleep_quality) and bob has 1
    // (creatine) — both users' rows coexist in the table. A row-count
    // assertion, not just a per-row user_id check, is what actually proves
    // isolation: a `using (true)` policy would return 3 rows here instead of 1.
    const { data, error } = await clientFor(bob).from('metrics')
      .select('slug, user_id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.every((m) => m.user_id === bob.id)).toBe(true)
  })
})
