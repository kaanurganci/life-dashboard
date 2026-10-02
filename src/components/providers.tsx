'use client'

import { useMemo, useState } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryClient, createIdbPersister, nullPersister } from '@/lib/query-client'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { ENTRY_CONFLICT_TARGET } from '@/lib/entries'
import { registerLogMetricDefaults } from '@/lib/log-metric'
import { resumeRestoredMutations, shouldDehydrateMutation } from '@/lib/outbox'
import type { MetricEntry } from '@/lib/schemas'

/**
 * `userId` binds the persisted cache (and its outbox) to one account. The
 * layout keys this component by it, so a different user gets a fresh client
 * and a different IndexedDB key rather than inheriting anything.
 */
export function Providers({
  userId, children,
}: { userId: string | null; children: React.ReactNode }) {
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

  const persister = useMemo(
    () => (userId ? createIdbPersister(userId) : nullPersister),
    [userId],
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        dehydrateOptions: { shouldDehydrateMutation },
      }}
      onSuccess={() => resumeRestoredMutations(queryClient)}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
