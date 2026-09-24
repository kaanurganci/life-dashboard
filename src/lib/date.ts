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
