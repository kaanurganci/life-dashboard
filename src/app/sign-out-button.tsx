'use client'

import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { createIdbPersister } from '@/lib/query-client'

export function SignOutButton({ userId }: { userId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  async function signOut() {
    // Sign out FIRST. Clearing while the session is live lets mounted
    // observers (the day tick, mutation-state subscribers) refetch under the
    // old user's session and the provider re-persist the result, and in-flight
    // retryers survive clear() and can repopulate it.
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()

    // The persisted cache is already bound to this user's id, so another account
    // cannot inherit it; removing it is for privacy on a shared device. A failure
    // here must not strand the user: they are signed out either way.
    try {
      queryClient.clear()
      await createIdbPersister(userId).removeClient()
    } catch (error) {
      console.error('failed to clear the local cache on sign-out', error)
    }

    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="h-10 rounded-lg border px-4 text-sm font-medium"
    >
      Sign out
    </button>
  )
}
