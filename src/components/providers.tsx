'use client'

import { useState } from 'react'
import { onlineManager } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryClient, idbPersister } from '@/lib/query-client'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { ENTRY_CONFLICT_TARGET } from '@/lib/entries'
import { LOG_METRIC_MUTATION_KEY } from '@/hooks/use-log-metric'
import type { MetricEntry } from '@/lib/schemas'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = createQueryClient()

    // Mutation defaults must be registered before a restored mutation resumes,
    // because a rehydrated mutation carries only its key and variables.
    client.setMutationDefaults(LOG_METRIC_MUTATION_KEY, {
      mutationFn: async (payload: MetricEntry) => {
        const supabase = createBrowserSupabase()
        const { error } = await supabase
          .from('metric_entries')
          .upsert(payload, { onConflict: ENTRY_CONFLICT_TARGET })
        if (error) throw error
      },
    })

    return client
  })

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: idbPersister,
        dehydrateOptions: {
          // Persisting paused mutations is what makes this an outbox.
          shouldDehydrateMutation: (m) => m.state.isPaused,
        },
      }}
      onSuccess={() => {
        if (onlineManager.isOnline()) {
          void queryClient.resumePausedMutations()
        }
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
