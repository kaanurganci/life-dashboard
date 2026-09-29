import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientFor, createTestUser, deleteTestUsers, type TestUser }
  from './helpers'

const DAY = '2026-09-24'

describe('v_daily_summary', () => {
  let alice: TestUser

  beforeAll(async () => {
    alice = await createTestUser()
    const a = clientFor(alice)

    const { data: metrics, error } = await a.from('metrics').insert([
      { slug: 'sleep_quality', label: 'Sleep', kind: 'scale',
        category: 'wellbeing', scale_min: 1, scale_max: 10, is_active: true },
      { slug: 'morning_readiness', label: 'Readiness', kind: 'scale',
        category: 'wellbeing', scale_min: 1, scale_max: 10, is_active: true },
      { slug: 'creatine', label: 'Creatine', kind: 'boolean',
        category: 'supplement', is_active: true },
      { slug: 'vitamin_d', label: 'Vitamin D', kind: 'boolean',
        category: 'supplement', is_active: true },
      { slug: 'retired_habit', label: 'Retired', kind: 'boolean',
        category: 'habit', is_active: false },
    ]).select('id, slug')
    if (error) throw error

    const id = (slug: string) => metrics!.find((m) => m.slug === slug)!.id

    const { error: entryError } = await a.from('metric_entries').insert([
      { metric_id: id('sleep_quality'), logged_on: DAY, value_num: 7 },
      { metric_id: id('morning_readiness'), logged_on: DAY, value_num: 6 },
      { metric_id: id('creatine'), logged_on: DAY, value_bool: true },
      { metric_id: id('vitamin_d'), logged_on: DAY, value_bool: false },
    ])
    if (entryError) throw entryError
  })

  afterAll(async () => {
    await deleteTestUsers(alice)
  })

  it('summarises a logged day', async () => {
    const { data, error } = await clientFor(alice)
      .from('v_daily_summary').select('*').eq('day', DAY).single()

    expect(error).toBeNull()
    expect(Number(data!.sleep_quality)).toBe(7)
    expect(Number(data!.morning_readiness)).toBe(6)
    expect(Number(data!.habits_done)).toBe(1)     // creatine only
  })

  it('counts habits_total from the active registry, not from entries', async () => {
    const { data } = await clientFor(alice)
      .from('v_daily_summary').select('habits_total').eq('day', DAY).single()

    // creatine + vitamin_d are active; retired_habit is not.
    expect(Number(data!.habits_total)).toBe(2)
  })

  it('returns no rows for a day with nothing logged', async () => {
    const { data } = await clientFor(alice)
      .from('v_daily_summary').select('day').eq('day', '2026-09-23')

    expect(data).toHaveLength(0)
  })
})
