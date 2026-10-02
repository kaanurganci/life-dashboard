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
    const { result: r } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    const result = { get current() { return r.current.day } }
    expect(result.current).toBe('2026-09-24')
  })

  it('recomputes when the app comes back to the foreground', () => {
    const { result: r } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    const result = { get current() { return r.current.day } }

    vi.setSystemTime(new Date('2026-09-25T06:30:00Z'))
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current).toBe('2026-09-25')
  })

  it('recomputes on focus', () => {
    const { result: r } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    const result = { get current() { return r.current.day } }

    vi.setSystemTime(new Date('2026-09-25T06:30:00Z'))
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(result.current).toBe('2026-09-25')
  })

  it('recomputes on the interval for an app left open across midnight', () => {
    const { result: r } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    const result = { get current() { return r.current.day } }

    vi.setSystemTime(new Date('2026-09-25T00:00:30+01:00'))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current).toBe('2026-09-25')
  })

  it('uses the profile timezone, not the device or London', () => {
    // 20:30Z is already the 25th in Tokyo but still the 24th in London.
    vi.setSystemTime(new Date('2026-09-24T20:30:00Z'))
    const tokyoHook = renderHook(() => useToday('2026-09-24', 'Asia/Tokyo'))
    const londonHook = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    const tokyo = { result: { get current() { return tokyoHook.result.current.day } } }
    const london = { result: { get current() { return londonHook.result.current.day } } }

    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(tokyo.result.current).toBe('2026-09-25')
    expect(london.result.current).toBe('2026-09-24')
  })

  it('re-derives on mount, in case the seed came from a stale cached shell', () => {
    vi.setSystemTime(new Date('2026-09-25T06:30:00Z'))
    const { result } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.day).toBe('2026-09-25')
  })

  it('flips at the next local midnight without waiting for the interval', () => {
    vi.setSystemTime(new Date('2026-09-24T22:59:50Z')) // 23:59:50 BST
    const { result } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.day).toBe('2026-09-24')

    act(() => { vi.advanceTimersByTime(10_500) }) // past midnight, before the 60s tick
    expect(result.current.day).toBe('2026-09-25')
  })

  it('refresh returns the real day immediately', () => {
    const { result } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    vi.setSystemTime(new Date('2026-09-25T06:30:00Z'))
    let returned = ''
    act(() => { returned = result.current.refresh() })
    expect(returned).toBe('2026-09-25')
  })

  it('stops listening on unmount', () => {
    const { unmount } = renderHook(() => useToday('2026-09-24', 'Europe/London'))
    const remove = vi.spyOn(window, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith('focus', expect.any(Function))
  })
})
