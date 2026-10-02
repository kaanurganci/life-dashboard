'use client'

import { useCallback, useEffect, useState } from 'react'
import { localDay, msUntilNextDay } from '@/lib/date'

/** Backstop for timers that were throttled or skipped while backgrounded. */
const RECHECK_MS = 60_000

/**
 * The current calendar day in the profile's timezone. Seeded with the
 * server-rendered day so first paint is correct, then re-derived on mount, when
 * a backgrounded PWA comes forward (visibilitychange, focus, bfcache restore),
 * at the next local midnight, and on a slow interval.
 *
 * `refresh` re-derives the day immediately and returns it. Writers call it at
 * write time so a stale rendered day can never decide where a write lands.
 */
export function useToday(initialDay: string, timeZone: string) {
  const [day, setDay] = useState(initialDay)

  const refresh = useCallback(() => {
    const now = localDay(new Date(), timeZone)
    setDay(now)
    return now
  }, [timeZone])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    const interval = setInterval(refresh, RECHECK_MS)

    // A seed from a cached shell may already be stale.
    const mount = setTimeout(refresh, 0)

    // Closes the visible-staleness window for an app left open across midnight.
    let midnight: ReturnType<typeof setTimeout>
    const armMidnight = () => {
      midnight = setTimeout(() => {
        refresh()
        armMidnight()
      }, msUntilNextDay(new Date(), timeZone) + 250)
    }
    armMidnight()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      clearInterval(interval)
      clearTimeout(mount)
      clearTimeout(midnight)
    }
  }, [timeZone, refresh])

  return { day, refresh }
}
