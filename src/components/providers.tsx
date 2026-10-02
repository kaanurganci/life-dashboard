'use client'

import { useMemo, useState } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryClient, createIdbPersister, nullPersister } from '@/lib/query-client'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { writeEntry } from '@/lib/write-entry'
import { useStableUser } from '@/hooks/use-stable-user'
import { registerLogMetricDefaults } from '@/lib/log-metric'
import { resumeRestoredMutations, shouldDehydrateMutation } from '@/lib/outbox'
import type { MetricEntry } from '@/lib/schemas'

/**
 * `userId` is a user, null (confirmed signed out) or undefined (the server could
 * not tell). Unknown keeps the last known user so a transient auth hiccup never
 * swaps in the no-op persister and drops the queue. A genuine change of user
 * remounts the inner provider: fresh client, different IndexedDB key.
 */
export function Providers({
  userId, children,
}: { userId: string | null | undefined; children: React.ReactNode }) {
  const effective = useStableUser(userId)
  return (
    <UserProviders key={effective ?? 'anon'} userId={effective}>
      {children}
    </UserProviders>
  )
}

/**
 * `userId` binds the persisted cache (and its outbox) to one account. The
 * layout keys this component by it, so a different user gets a fresh client
 * and a different IndexedDB key rather than inheriting anything.
 */
function UserProviders({
  userId, children,
}: { userId: string | null; children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = createQueryClient()

    // Defaults must be registered before a restored mutation resumes, because a
    // rehydrated mutation carries only its key and variables.
    registerLogMetricDefaults(client, async (payload: MetricEntry) => {
      await writeEntry(createBrowserSupabase(), payload)
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
