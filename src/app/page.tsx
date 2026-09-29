import { MorningCard } from '@/components/morning-card'
import { localDay } from '@/lib/date'
import { createServerSupabase } from '@/lib/supabase/server'
import { SignOutButton } from './sign-out-button'

// The middleware already redirects unauthenticated requests to /login, so
// this only ever renders for a signed-in user.
export default async function TodayPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('timezone').eq('id', user!.id).single()

  // Rendered server-side for the first paint; the client recomputes on mount
  // so a phone that crosses midnight while open stays correct.
  const day = localDay(new Date(), profile?.timezone ?? 'Europe/London')

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex justify-end">
        <SignOutButton />
      </div>
      <MorningCard day={day} />
    </main>
  )
}
