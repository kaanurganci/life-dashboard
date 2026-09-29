import { daySchema, metricEntrySchema, type Metric, type MetricEntry } from '@/lib/schemas'

/** Mirrors the unique constraint on metric_entries. */
export const ENTRY_CONFLICT_TARGET = 'user_id,metric_id,logged_on,occurrence'

/**
 * Rejects anything that isn't a real calendar date, not just the right shape.
 * `2026-13-40` matches the YYYY-MM-DD regex but Postgres's `date` cast rejects
 * it, so the row would only fail after it reached the queue.
 */
function assertRealCalendarDay(day: string): void {
  const shapeCheck = daySchema.safeParse(day)
  if (!shapeCheck.success) throw new Error('day must be YYYY-MM-DD')

  const [year, month, dayOfMonth] = day.split('-').map(Number)
  const roundTripped = new Date(Date.UTC(year, month - 1, dayOfMonth))
  if (roundTripped.toISOString().slice(0, 10) !== day) {
    throw new Error('day must be a real calendar date (YYYY-MM-DD)')
  }
}

/**
 * Rejects NaN and +/-Infinity. `typeof` alone lets both through as "number",
 * and `JSON.stringify` turns either into `null` on the wire, so the row would
 * land with every value column null and die on the `exactly_one_value` check.
 */
function assertFiniteValue(value: number, metric: Metric): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${metric.slug} must be a finite number`)
  }
}

/**
 * Builds the row for a metric's value, choosing the column its kind requires.
 * Throws on anything the `validate_metric_entry` trigger would reject, so a bad
 * value fails on the device instead of surviving in the offline queue.
 */
export function buildEntryPayload(
  metric: Metric,
  value: number | boolean | string,
  day: string,
  occurrence = 1,
): MetricEntry {
  assertRealCalendarDay(day)

  const occurrenceCheck = metricEntrySchema.shape.occurrence.safeParse(occurrence)
  if (!occurrenceCheck.success) {
    throw new Error('occurrence must be a positive whole number')
  }

  const base = {
    metric_id: metric.id,
    logged_on: day,
    occurrence,
    value_num: null as number | null,
    value_bool: null as boolean | null,
    value_text: null as string | null,
  }

  switch (metric.kind) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`${metric.slug} expects a boolean`)
      }
      return { ...base, value_bool: value }

    case 'text':
      if (typeof value !== 'string') {
        throw new Error(`${metric.slug} expects text`)
      }
      return { ...base, value_text: value }

    case 'scale': {
      if (typeof value !== 'number') {
        throw new Error(`${metric.slug} expects a number`)
      }
      assertFiniteValue(value, metric)
      const min = metric.scale_min ?? 1
      const max = metric.scale_max ?? 10
      if (value < min || value > max) {
        throw new Error(`${metric.slug} must be between ${min} and ${max}`)
      }
      return { ...base, value_num: value }
    }

    default: // numeric, duration
      if (typeof value !== 'number') {
        throw new Error(`${metric.slug} expects a number`)
      }
      assertFiniteValue(value, metric)
      return { ...base, value_num: value }
  }
}

/** Reads the column a metric's kind stores its value in. */
export function valueOf(
  metric: Metric,
  entry: MetricEntry | undefined,
): number | boolean | string | null {
  if (!entry) return null

  switch (metric.kind) {
    case 'boolean': return entry.value_bool
    case 'text':    return entry.value_text
    default:        return entry.value_num
  }
}
