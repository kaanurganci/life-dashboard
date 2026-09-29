import { createServerSupabase } from '@/lib/supabase/server'
import { SignOutButton } from './sign-out-button'

// Placeholder authenticated home. The middleware already redirects
// unauthenticated requests to /login, so this only ever renders for a
// signed-in user. Task 9 replaces this with the real morning card.
export default async function Home() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-sm flex-col items-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Signed in</h1>
        <p className="text-sm text-neutral-600">
          {user ? user.email : 'Session not found.'}
        </p>
        <SignOutButton />
      </main>
    </div>
  )
}
