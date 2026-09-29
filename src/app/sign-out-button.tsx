'use client'

import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()

  async function signOut() {
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
