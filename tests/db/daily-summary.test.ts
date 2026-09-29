import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clientFor, createTestUser, deleteTestUsers, type TestUser }
  from './helpers'

const DAY = '2026-09-24'

describe('v_daily_summary', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    alice = await createTestUser()
    bob = await createTestUser()
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

    // NOTE: every object in this array explicitly sets `occurrence`, even
    // where it's just the default 1. PostgREST's bulk/array insert unions
    // the key set across all objects in the payload and inserts NULL (not
    // the column default) for any row missing a key that another row in the
    // same batch specifies — see metrics insert above where the same quirk
    // required explicit `is_active` on every row.
    const { error: entryError } = await a.from('metric_entries').insert([
      { metric_id: id('sleep_quality'), logged_on: DAY, value_num: 7, occurrence: 1 },
      // A deliberate second same-day reading, occurrence 2, with a HIGHER
      // value than occurrence 1. Additional data, not a correction: the
      // view must keep reporting the occurrence-1 value (7), never max().
      { metric_id: id('sleep_quality'), logged_on: DAY, value_num: 9, occurrence: 2 },
      { metric_id: id('morning_readiness'), logged_on: DAY, value_num: 6, occurrence: 1 },
      { metric_id: id('creatine'), logged_on: DAY, value_bool: true, occurrence: 1 },
      // A second same-day true entry for the SAME habit. habits_done must
      // count distinct habits (1), not rows (2).
      { metric_id: id('creatine'), logged_on: DAY, value_bool: true, occurrence: 2 },
      { metric_id: id('vitamin_d'), logged_on: DAY, value_bool: false, occurrence: 1 },
    ])
    if (entryError) throw entryError

    // Bob: his own metrics and his own day, logged on the SAME date as
    // Alice's, so a definer-rights (RLS-bypassing) view would show him
    // both rows and this test would fail.
    const b = clientFor(bob)

    const { data: bobMetrics, error: bobMetricError } = await b.from('metrics')
      .insert([
        { slug: 'sleep_quality', label: 'Sleep', kind: 'scale',
          category: 'wellbeing', scale_min: 1, scale_max: 10, is_active: true },
        { slug: 'meditation', label: 'Meditation', kind: 'boolean',
          category: 'habit', is_active: true },
      ]).select('id, slug')
    if (bobMetricError) throw bobMetricError

    const bobId = (slug: string) => bobMetrics!.find((m) => m.slug === slug)!.id

    const { error: bobEntryError } = await b.from('metric_entries').insert([
      { metric_id: bobId('sleep_quality'), logged_on: DAY, value_num: 3 },
      { metric_id: bobId('meditation'), logged_on: DAY, value_bool: true },
    ])
    if (bobEntryError) throw bobEntryError
  // Two users plus their metrics/entries push past the default 10s hook
  // timeout under normal network latency; match the suite's existing
  // 30s testTimeout (vitest.config.ts).
  }, 30_000)

  afterAll(async () => {
    await deleteTestUsers(alice, bob)
  })

  it('summarises a logged day', async () => {
    const { data, error } = await clientFor(alice)
      .from('v_daily_summary').select('*').eq('day', DAY).single()

    expect(error).toBeNull()
    // occurrence 1 only: a higher-valued occurrence-2 row exists for the
    // same day/metric and must NOT win via max().
    expect(Number(data!.sleep_quality)).toBe(7)
    expect(Number(data!.morning_readiness)).toBe(6)
    // creatine logged true twice (occurrence 1 and 2) counts as ONE habit
    // done, not two rows.
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

  it('scopes rows to the calling user via RLS, not just app-level filtering', async () => {
    // Both alice and bob have a row for DAY. If the view were definer-rights
    // (bypassing RLS on metric_entries/metrics), an unfiltered select as bob
    // would return both rows. security_invoker = on must make RLS apply, so
    // bob sees exactly one row, and it must be his own.
    const { data, error } = await clientFor(bob).from('v_daily_summary').select('*')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].user_id).toBe(bob.id)
    expect(data!.some((row) => row.user_id === alice.id)).toBe(false)
  })
})
