import { z } from 'zod'

export const metricKindSchema = z.enum([
  'boolean', 'scale', 'numeric', 'duration', 'text',
])
export type MetricKind = z.infer<typeof metricKindSchema>

export const metricSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  label: z.string().min(1),
  kind: metricKindSchema,
  category: z.string().min(1),
  unit: z.string().nullable(),
  scale_min: z.number().int().nullable(),
  scale_max: z.number().int().nullable(),
  sort_order: z.number().int(),
})
export type Metric = z.infer<typeof metricSchema>

export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'day must be YYYY-MM-DD',
})

export const metricEntrySchema = z.object({
  id: z.uuid().optional(),
  metric_id: z.uuid(),
  logged_on: daySchema,
  occurrence: z.number().int().positive(),
  value_num: z.number().nullable(),
  value_bool: z.boolean().nullable(),
  value_text: z.string().nullable(),
})
export type MetricEntry = z.infer<typeof metricEntrySchema>
