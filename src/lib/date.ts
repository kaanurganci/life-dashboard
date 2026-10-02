export const DEFAULT_TIMEZONE = 'Europe/London'

/**
 * The calendar day an observation belongs to, in the user's timezone.
 * en-CA formats as YYYY-MM-DD, which is what Postgres `date` wants.
 */
export function localDay(at: Date = new Date(), timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/**
 * The day before `day`. Operates on the calendar string with UTC arithmetic so
 * no daylight-saving transition can swallow or duplicate a day.
 */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  at.setUTCDate(at.getUTCDate() - 1)
  return at.toISOString().slice(0, 10)
}

/**
 * Milliseconds from `at` until the next local midnight in `timeZone`. Computed
 * from the wall-clock time of day, so it is approximate on a daylight-saving
 * change day; callers re-check the real day when it fires, so that is safe.
 */
export function msUntilNextDay(at: Date = new Date(), timeZone = DEFAULT_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const elapsed = ((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 + at.getMilliseconds()
  return 24 * 60 * 60 * 1000 - elapsed
}
