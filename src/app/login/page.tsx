'use client'

import { useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })

    if (error) setError(error.message)
    else setSent(true)
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-neutral-600">
          A sign-in link is on its way to {email}.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form onSubmit={send} className="mt-4 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="h-12 w-full rounded-lg border px-3 text-base"
        />
        <button
          type="submit"
          className="h-12 w-full rounded-lg bg-black text-base font-medium text-white"
        >
          Send link
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  )
}
