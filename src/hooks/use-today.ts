'use client'

import { useEffect, useState } from 'react'
import { localDay } from '@/lib/date'

/** Backstop for an app left open and visible across midnight. */
const RECHECK_MS = 60_000

/**
 * The current calendar day in the profile's timezone. Seeded with the
 * server-rendered day so first paint is correct, then recomputed whenever a
 * backgrounded PWA comes forward (visibilitychange, focus, bfcache restore) and
 * on a slow interval. Without this a home-screen app resumed the next morning
 * keeps yesterday's date and writes onto yesterday's rows.
 */
export function useToday(initialDay: string, timeZone: string): string {
  const [day, setDay] = useState(initialDay)

  useEffect(() => {
    const refresh = () => setDay(localDay(new Date(), timeZone))
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    const timer = setInterval(refresh, RECHECK_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      clearInterval(timer)
    }
  }, [timeZone])

  return day
}
