import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStableUser } from '@/hooks/use-stable-user'

function run(initial: string | null | undefined) {
  return renderHook(({ id }) => useStableUser(id), { initialProps: { id: initial } })
}

describe('useStableUser', () => {
  it('keeps the last known user when the server cannot tell', () => {
    const h = run('u1')
    h.rerender({ id: undefined })
    expect(h.result.current).toBe('u1')
  })

  it('a confirmed sign-out does clear it', () => {
    const h = run('u1')
    h.rerender({ id: null })
    expect(h.result.current).toBeNull()
  })

  it('a new user replaces it, including after the anonymous login page', () => {
    const h = run(null)
    h.rerender({ id: 'u2' })
    expect(h.result.current).toBe('u2')
  })

  it('keeps the user across repeated unknowns', () => {
    const h = run('u1')
    h.rerender({ id: undefined })
    h.rerender({ id: undefined })
    expect(h.result.current).toBe('u1')
  })
})
