'use client'

import { useState } from 'react'

/**
 * Holds the last CONFIRMED user across renders. The server passes `undefined`
 * when it could not tell who is signed in; that must not look like a sign-out,
 * or the provider would switch to the no-op persister and drop the queue.
 */
export function useStableUser(userId: string | null | undefined): string | null {
  const [known, setKnown] = useState<string | null>(userId ?? null)
  if (userId !== undefined && userId !== known) setKnown(userId)
  return userId === undefined ? known : userId
}
