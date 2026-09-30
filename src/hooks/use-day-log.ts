'use client'

import { useQuery } from '@tanstack/react-query'
import { createBrowserSupabase } from '@/lib/supabase/client'
import type { Metric, MetricEntry } from '@/lib/schemas'

export function useDayLog(day: string) {
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: async (): Promise<Metric[]> => {
      const supabase = createBrowserSupabase()
      const { data, error } = await supabase
        .from('metrics')
        .select('id, slug, label, kind, category, unit, scale_min, scale_max, sort_order')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Metric[]
    },
    staleTime: 1000 * 60 * 60,
  })

  const entries = useQuery({
    queryKey: ['entries', day],
    queryFn: async (): Promise<MetricEntry[]> => {
      const supabase = createBrowserSupabase()
      const { data, error } = await supabase
        .from('metric_entries')
        .select('id, metric_id, logged_on, occurrence, value_num, value_bool, value_text')
        .eq('logged_on', day)
        // The morning card shows the canonical occurrence-1 reading, matching
        // v_daily_summary. Filtering here rather than client-side avoids pulling
        // rows down only to discard them. A future multi-occurrence UI must
        // change this query, not just the map below.
        .eq('occurrence', 1)
      if (error) throw error
      return data as MetricEntry[]
    },
  })

  const byMetric = new Map<string, MetricEntry>()
  for (const entry of entries.data ?? []) {
    byMetric.set(entry.metric_id, entry)
  }

  return {
    metrics: metrics.data ?? [],
    entries: byMetric,
    isLoading: metrics.isLoading || entries.isLoading,
  }
}
