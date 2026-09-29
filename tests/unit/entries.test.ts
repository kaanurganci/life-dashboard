import { describe, expect, it } from 'vitest'
import { buildEntryPayload, valueOf, ENTRY_CONFLICT_TARGET } from '@/lib/entries'
import type { Metric } from '@/lib/schemas'

const sleep: Metric = {
  id: 'm1', slug: 'sleep_quality', label: 'Sleep Quality', kind: 'scale',
  category: 'wellbeing', unit: null, scale_min: 1, scale_max: 10, sort_order: 1,
}
const creatine: Metric = {
  id: 'm2', slug: 'creatine', label: 'Creatine', kind: 'boolean',
  category: 'supplement', unit: null, scale_min: null, scale_max: null,
  sort_order: 10,
}
const weight: Metric = {
  id: 'm3', slug: 'bodyweight_kg', label: 'Bodyweight', kind: 'numeric',
  category: 'body', unit: 'kg', scale_min: null, scale_max: null, sort_order: 30,
}
const runDuration: Metric = {
  id: 'm4', slug: 'run_duration_sec', label: 'Run Duration', kind: 'duration',
  category: 'training', unit: 'sec', scale_min: null, scale_max: null, sort_order: 40,
}

describe('buildEntryPayload', () => {
  it('puts a scale value in value_num', () => {
    expect(buildEntryPayload(sleep, 7, '2026-09-24')).toEqual({
      metric_id: 'm1', logged_on: '2026-09-24', occurrence: 1,
      value_num: 7, value_bool: null, value_text: null,
    })
  })

  it('puts a boolean value in value_bool', () => {
    expect(buildEntryPayload(creatine, true, '2026-09-24')).toEqual({
      metric_id: 'm2', logged_on: '2026-09-24', occurrence: 1,
      value_num: null, value_bool: true, value_text: null,
    })
  })

  it('keeps false as a real value, not an absence', () => {
    const payload = buildEntryPayload(creatine, false, '2026-09-24')
    expect(payload.value_bool).toBe(false)
    expect(payload.value_num).toBeNull()
  })

  it('accepts a decimal for an unbounded numeric metric', () => {
    expect(buildEntryPayload(weight, 82.4, '2026-09-24').value_num).toBe(82.4)
  })

  it('passes occurrence through for a second dose', () => {
    expect(buildEntryPayload(creatine, true, '2026-09-24', 2).occurrence).toBe(2)
  })

  it('rejects a scale value outside its bounds before it reaches the database', () => {
    expect(() => buildEntryPayload(sleep, 11, '2026-09-24'))
      .toThrow(/between 1 and 10/)
    expect(() => buildEntryPayload(sleep, 0, '2026-09-24'))
      .toThrow(/between 1 and 10/)
  })

  it('rejects a mismatched value type', () => {
    expect(() => buildEntryPayload(creatine, 1 as unknown as boolean, '2026-09-24'))
      .toThrow(/expects a boolean/)
    expect(() => buildEntryPayload(sleep, true as unknown as number, '2026-09-24'))
      .toThrow(/expects a number/)
  })

  it('rejects a malformed day', () => {
    expect(() => buildEntryPayload(sleep, 7, '24/09/2026')).toThrow(/YYYY-MM-DD/)
  })

  it('rejects NaN on a scale metric before it reaches the range check', () => {
    expect(() => buildEntryPayload(sleep, Number('abc'), '2026-09-24'))
      .toThrow(/finite number/)
  })

  it('rejects NaN on an unbounded numeric metric', () => {
    expect(() => buildEntryPayload(weight, Number('abc'), '2026-09-24'))
      .toThrow(/finite number/)
  })

  it('rejects NaN on a duration metric', () => {
    expect(() => buildEntryPayload(runDuration, Number('abc'), '2026-09-24'))
      .toThrow(/finite number/)
  })

  it('rejects Infinity on a scale metric', () => {
    expect(() => buildEntryPayload(sleep, Infinity, '2026-09-24'))
      .toThrow(/finite number/)
    expect(() => buildEntryPayload(sleep, -Infinity, '2026-09-24'))
      .toThrow(/finite number/)
  })

  it('rejects Infinity on an unbounded numeric metric', () => {
    expect(() => buildEntryPayload(weight, Infinity, '2026-09-24'))
      .toThrow(/finite number/)
    expect(() => buildEntryPayload(weight, -Infinity, '2026-09-24'))
      .toThrow(/finite number/)
  })

  it('rejects Infinity on a duration metric', () => {
    expect(() => buildEntryPayload(runDuration, Infinity, '2026-09-24'))
      .toThrow(/finite number/)
    expect(() => buildEntryPayload(runDuration, -Infinity, '2026-09-24'))
      .toThrow(/finite number/)
  })

  it('rejects a zero occurrence', () => {
    expect(() => buildEntryPayload(creatine, true, '2026-09-24', 0))
      .toThrow(/positive whole number/)
  })

  it('rejects a negative occurrence', () => {
    expect(() => buildEntryPayload(creatine, true, '2026-09-24', -1))
      .toThrow(/positive whole number/)
  })

  it('rejects an impossible calendar date even when it matches the shape', () => {
    expect(() => buildEntryPayload(sleep, 7, '2026-13-40'))
      .toThrow(/real calendar date/)
    expect(() => buildEntryPayload(sleep, 7, '2026-02-30'))
      .toThrow(/real calendar date/)
  })
})

describe('valueOf', () => {
  it('reads the column matching the kind', () => {
    const entry = buildEntryPayload(sleep, 7, '2026-09-24')
    expect(valueOf(sleep, entry)).toBe(7)
  })

  it('returns null for a missing entry', () => {
    expect(valueOf(sleep, undefined)).toBeNull()
  })

  it('distinguishes a logged false from a missing entry', () => {
    const entry = buildEntryPayload(creatine, false, '2026-09-24')
    expect(valueOf(creatine, entry)).toBe(false)
    expect(valueOf(creatine, undefined)).toBeNull()
  })
})

describe('ENTRY_CONFLICT_TARGET', () => {
  it('matches the database unique constraint', () => {
    expect(ENTRY_CONFLICT_TARGET).toBe('user_id,metric_id,logged_on,occurrence')
  })
})
