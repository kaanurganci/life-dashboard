'use client'

import { useState } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryClient, idbPersister } from '@/lib/query-client'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { ENTRY_CONFLICT_TARGET } from '@/lib/entries'
import { registerLogMetricDefaults } from '@/lib/log-metric'
import type { MetricEntry } from '@/lib/schemas'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = createQueryClient()

    // Defaults must be registered before a restored mutation resumes, because a
    // rehydrated mutation carries only its key and variables.
    registerLogMetricDefaults(client, async (payload: MetricEntry) => {
      const supabase = createBrowserSupabase()
      const { error } = await supabase
        .from('metric_entries')
        .upsert(payload, { onConflict: ENTRY_CONFLICT_TARGET })
      if (error) throw error
    })

    return client
  })

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: idbPersister,
        dehydrateOptions: {
          // Persisting unsettled mutations is what makes this an outbox. Paused
          // is not enough: a weak-signal write reports online, so it sits in a
          // retry backoff as 'pending' and would be lost on reload.
          shouldDehydrateMutation: (m) => m.state.status === 'pending',
        },
      }}
      onSuccess={() => {
        // A restored mutation has no retryer, so continue() re-executes it
        // (scoped, so in its original per-slot order). Offline it just pauses.
        for (const m of queryClient.getMutationCache().getAll()) {
          if (m.state.status === 'pending') void m.continue().catch(() => {})
        }
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
