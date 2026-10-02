import { MorningCard } from '@/components/morning-card'
import { DEFAULT_TIMEZONE, localDay } from '@/lib/date'
import { createServerSupabase } from '@/lib/supabase/server'
import { SignOutButton } from './sign-out-button'

// The middleware already redirects unauthenticated requests to /login, so
// this only ever renders for a signed-in user.
export default async function TodayPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles').select('timezone').eq('id', user!.id).single()

  // Seeds the first paint only. MorningCard re-derives the day on the client
  // (on visibilitychange, focus and a slow interval) from the same timezone, so
  // a PWA resumed after midnight does not keep writing to yesterday.
  const timeZone = profile?.timezone ?? DEFAULT_TIMEZONE
  const day = localDay(new Date(), timeZone)

  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex justify-end">
        <SignOutButton />
      </div>
      <MorningCard initialDay={day} timeZone={timeZone} />
    </main>
  )
}
