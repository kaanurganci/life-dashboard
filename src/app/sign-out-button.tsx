'use client'

import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { idbPersister } from '@/lib/query-client'

export function SignOutButton() {
  const router = useRouter()
  const queryClient = useQueryClient()

  async function signOut() {
    // The persisted cache is keyed globally, not per user, so a second account
    // on this browser would inherit the first one's metrics and entries. Clear
    // memory and IndexedDB first. A failure here must not block sign-out: the
    // in-memory clear has already run, and staying signed in is worse.
    try {
      queryClient.clear()
      await idbPersister.removeClient()
    } catch (error) {
      console.error('failed to clear the local cache on sign-out', error)
    }

    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
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
