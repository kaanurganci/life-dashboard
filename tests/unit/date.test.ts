import { describe, expect, it } from 'vitest'
import { localDay, previousDay, msUntilNextDay } from '@/lib/date'

describe('localDay', () => {
  it('returns YYYY-MM-DD', () => {
    expect(localDay(new Date('2026-09-24T09:00:00Z'))).toBe('2026-09-24')
  })

  it('rolls to the next day for a late-night entry during BST', () => {
    // 23:40 UTC on 24 Sep is 00:40 on 25 Sep in London (UTC+1)
    expect(localDay(new Date('2026-09-24T23:40:00Z'))).toBe('2026-09-25')
  })

  it('does not roll during GMT', () => {
    // 23:40 UTC in January is still 23:40 in London (UTC+0)
    expect(localDay(new Date('2026-01-15T23:40:00Z'))).toBe('2026-01-15')
  })

  it('respects an explicit timezone', () => {
    expect(localDay(new Date('2026-09-24T23:40:00Z'), 'America/New_York'))
      .toBe('2026-09-24')
  })
})

describe('previousDay', () => {
  it('steps back one day', () => {
    expect(previousDay('2026-09-24')).toBe('2026-09-23')
  })

  it('steps back across a month boundary', () => {
    expect(previousDay('2026-10-01')).toBe('2026-09-30')
  })

  it('steps back across a DST boundary without losing a day', () => {
    // UK clocks go back on 25 Oct 2026
    expect(previousDay('2026-10-26')).toBe('2026-10-25')
  })
})

describe('msUntilNextDay', () => {
  it('counts down to local midnight in the given timezone', () => {
    // 23:59:50 BST on 24 Sep
    expect(msUntilNextDay(new Date('2026-09-24T22:59:50Z'), 'Europe/London')).toBe(10_000)
  })

  it('uses the timezone, not UTC', () => {
    // 16:00 BST is 8h from midnight; the same instant is 00:00 in Tokyo.
    const at = new Date('2026-09-24T15:00:00Z')
    expect(msUntilNextDay(at, 'Europe/London')).toBe(8 * 3600_000)
    expect(msUntilNextDay(at, 'Asia/Tokyo')).toBe(24 * 3600_000)
  })
})
