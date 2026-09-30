import { describe, expect, it } from 'vitest'
import { isProtectedPath } from '@/lib/supabase/guard'

describe('isProtectedPath', () => {
  it('protects the dashboard', () => {
    expect(isProtectedPath('/')).toBe(true)
    expect(isProtectedPath('/history')).toBe(true)
  })

  it('leaves the auth routes open', () => {
    expect(isProtectedPath('/login')).toBe(false)
    expect(isProtectedPath('/auth/callback')).toBe(false)
  })

  it('leaves static and PWA assets open', () => {
    expect(isProtectedPath('/manifest.webmanifest')).toBe(false)
    expect(isProtectedPath('/sw.js')).toBe(false)
    expect(isProtectedPath('/icons/icon-192.png')).toBe(false)
    expect(isProtectedPath('/_next/static/chunk.js')).toBe(false)
  })

  it('leaves the cron route open, since it authorizes itself via CRON_SECRET', () => {
    expect(isProtectedPath('/api/keep-warm')).toBe(false)
  })

  it('still protects other API routes by default', () => {
    expect(isProtectedPath('/api/anything-else')).toBe(true)
  })
})
