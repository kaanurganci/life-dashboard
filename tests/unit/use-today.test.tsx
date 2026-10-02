import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToday } from '@/hooks/use-today'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-24T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('useToday', () => {
  it('starts on the server-rendered day', () => {
    const { result } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    expect(result.current).toBe('2026-09-24')
  })

  it('recomputes when the app comes back to the foreground', () => {
    const { result } = renderHook(() => useToday('2026-09-24', 'Europe/London'))

    vi.setSystemTime(new Date('2026-09-25T06:30:00Z'))
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current).toBe('2026-09-25')
  })

  it('recomputes on focus', () => {
    const { result } = renderHook(() => useToday('2026-09-24', 'Europe/London'))

    vi.setSystemTime(new Date('2026-09-25T06:30:00Z'))
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toBe('2026-09-25')
  })

  it('recomputes on the interval for an app left open across midnight', () => {
    const { result } = renderHook(() => useToday('2026-09-24', 'Europe/London'))

    vi.setSystemTime(new Date('2026-09-25T00:00:30+01:00'))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current).toBe('2026-09-25')
  })

  it('uses the profile timezone, not the device or London', () => {
    // 20:30Z is already the 25th in Tokyo but still the 24th in London.
    vi.setSystemTime(new Date('2026-09-24T20:30:00Z'))
    const tokyo = renderHook(() => useToday('2026-09-24', 'Asia/Tokyo'))
    const london = renderHook(() => useToday('2026-09-24', 'Europe/London'))

    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(tokyo.result.current).toBe('2026-09-25')
    expect(london.result.current).toBe('2026-09-24')
  })

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    const remove = vi.spyOn(window, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith('focus', expect.any(Function))
  })
})
