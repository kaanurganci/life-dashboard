import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientFor, createTestUser, deleteTestUsers, type TestUser }
  from './helpers'

const DAY = '2026-09-24'

describe('metric_entries', () => {
  let alice: TestUser
  let bob: TestUser
  let sleepId: string
  let creatineId: string
  let weightId: string
  let bobHabitId: string

  beforeAll(async () => {
    alice = await createTestUser()
    bob = await createTestUser()
    const a = clientFor(alice)

    const { data: metrics, error } = await a.from('metrics').insert([
      { slug: 'sleep_quality', label: 'Sleep', kind: 'scale',
        category: 'wellbeing', scale_min: 1, scale_max: 10 },
      { slug: 'creatine', label: 'Creatine', kind: 'boolean',
        category: 'supplement' },
      { slug: 'bodyweight_kg', label: 'Bodyweight', kind: 'numeric',
        category: 'body', unit: 'kg' },
    ]).select('id, slug')
    if (error) throw error

    sleepId = metrics!.find((m) => m.slug === 'sleep_quality')!.id
    creatineId = metrics!.find((m) => m.slug === 'creatine')!.id
    weightId = metrics!.find((m) => m.slug === 'bodyweight_kg')!.id

    const { data: bobMetric } = await clientFor(bob).from('metrics')
      .insert({ slug: 'creatine', label: 'Creatine', kind: 'boolean',
                category: 'supplement' })
      .select('id').single()
    bobHabitId = bobMetric!.id
  })

  afterAll(async () => {
    await deleteTestUsers(alice, bob)
  })

  it('accepts a scale value inside its bounds', async () => {
    const { data, error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: sleepId, logged_on: DAY, value_num: 7 })
      .select('user_id, occurrence, source').single()

    expect(error).toBeNull()
    expect(data?.user_id).toBe(alice.id)
    expect(data?.occurrence).toBe(1)
    expect(data?.source).toBe('dashboard')
  })

  it('rejects a scale value above its maximum', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: sleepId, logged_on: '2026-09-25', value_num: 11 })

    expect(error?.message).toContain('must be between 1 and 10')
  })

  it('rejects a scale value below its minimum', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: sleepId, logged_on: '2026-09-26', value_num: 0 })

    expect(error?.message).toContain('must be between 1 and 10')
  })

  it('rejects a boolean value on a scale metric', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: sleepId, logged_on: '2026-09-27', value_bool: true })

    expect(error?.message).toContain('expects a number')
  })

  it('rejects a numeric value on a boolean metric', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: DAY, value_num: 1 })

    expect(error?.message).toContain('expects a boolean')
  })

  it('rejects an entry with no value at all', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: '2026-09-28' })

    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('exactly_one_value')
  })

  it('rejects an entry with two values', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: '2026-09-29',
                value_bool: true, value_num: 1 })

    expect(error?.code).toBe('23514')
  })

  it('accepts an unbounded numeric metric', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: weightId, logged_on: DAY, value_num: 82.4 })

    expect(error).toBeNull()
  })

  it('rejects a second entry for the same metric and day', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: DAY, value_bool: true })
    expect(error).toBeNull()

    const { error: dupe } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: DAY, value_bool: false })
    expect(dupe?.code).toBe('23505')
  })

  it('allows a second dose via occurrence', async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: creatineId, logged_on: DAY, occurrence: 2,
                value_bool: true })

    expect(error).toBeNull()
  })

  it('upserts on the natural key', async () => {
    const { data, error } = await clientFor(alice).from('metric_entries')
      .upsert({ metric_id: sleepId, logged_on: DAY, occurrence: 1, value_num: 9 },
              { onConflict: 'user_id,metric_id,logged_on,occurrence' })
      .select('value_num').single()

    expect(error).toBeNull()
    expect(Number(data?.value_num)).toBe(9)
  })

  it("refuses an entry against another user's metric", async () => {
    const { error } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: bobHabitId, logged_on: DAY, value_bool: true })

    expect(error).not.toBeNull()
  })

  it("hides another user's entries", async () => {
    const { data } = await clientFor(bob).from('metric_entries').select('id')
    expect(data).toHaveLength(0)
  })

  it('defaults logged_at to now and keeps logged_on independent', async () => {
    const { data } = await clientFor(alice).from('metric_entries')
      .insert({ metric_id: weightId, logged_on: '2026-09-20', value_num: 83 })
      .select('logged_on, logged_at').single()

    expect(data?.logged_on).toBe('2026-09-20')
    // Back-filled: typed well after the day it belongs to.
    expect(new Date(data!.logged_at).getTime())
      .toBeGreaterThan(new Date('2026-09-21').getTime())
  })
})
