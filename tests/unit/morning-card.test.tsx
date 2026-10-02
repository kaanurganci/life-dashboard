import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MorningCard } from '@/components/morning-card'
import type { Metric, MetricEntry } from '@/lib/schemas'

const metrics: Metric[] = [
  { id: 'm1', slug: 'sleep_quality', label: 'Sleep Quality', kind: 'scale',
    category: 'wellbeing', unit: null, scale_min: 1, scale_max: 10, sort_order: 1 },
  { id: 'm2', slug: 'morning_readiness', label: 'Morning Readiness',
    kind: 'scale', category: 'wellbeing', unit: null, scale_min: 1,
    scale_max: 10, sort_order: 2 },
  { id: 'm3', slug: 'creatine', label: 'Creatine', kind: 'boolean',
    category: 'supplement', unit: null, scale_min: null, scale_max: null,
    sort_order: 10 },
]

const log = vi.fn()
let failedCount = 0
let entries = new Map<string, MetricEntry>()
let yesterdayEntries = new Map<string, MetricEntry>()

vi.mock('@/hooks/use-day-log', () => ({
  useDayLog: (day: string) => ({
    metrics,
    entries: day === '2026-09-24' ? entries : yesterdayEntries,
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-log-metric', () => ({
  useLogMetric: () => ({ log, pendingCount: 0, failedCount }),
  LOG_METRIC_MUTATION_KEY: ['log-metric'],
}))

vi.mock('@/hooks/use-today', () => ({ useToday: (seed: string) => ({ day: seed, refresh: () => seed }) }))

beforeEach(() => {
  log.mockClear()
  failedCount = 0
  entries = new Map()
  yesterdayEntries = new Map()
})

describe('MorningCard', () => {
  it('says plainly when writes failed to save', () => {
    failedCount = 2
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)

    expect(screen.getByRole('alert')).toHaveTextContent('2 entries failed to save')
  })

  it('shows no failure notice when nothing failed', () => {
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders a control for every active metric', () => {
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)

    expect(screen.getByRole('slider', { name: /sleep quality/i })).toBeVisible()
    expect(screen.getByRole('slider', { name: /morning readiness/i })).toBeVisible()
    expect(screen.getByRole('switch', { name: /creatine/i })).toBeVisible()
  })

  it('logs a habit when toggled', async () => {
    const user = userEvent.setup()
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)

    await user.click(screen.getByRole('switch', { name: /creatine/i }))

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'creatine' }), true,
    )
  })

  it('logs false when un-toggling a logged habit', async () => {
    entries.set('m3', {
      metric_id: 'm3', logged_on: '2026-09-24', occurrence: 1,
      value_num: null, value_bool: true, value_text: null,
    })
    const user = userEvent.setup()
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)

    const toggle = screen.getByRole('switch', { name: /creatine/i })
    expect(toggle).toBeChecked()
    await user.click(toggle)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'creatine' }), false,
    )
  })

  it('shows an existing slider value', () => {
    entries.set('m1', {
      metric_id: 'm1', logged_on: '2026-09-24', occurrence: 1,
      value_num: 7, value_bool: null, value_text: null,
    })
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)

    expect(screen.getByRole('slider', { name: /sleep quality/i }))
      .toHaveValue('7')
  })

  it('commits once per drag gesture, on release', () => {
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)
    const slider = screen.getByRole('slider', { name: /sleep quality/i })

    fireEvent.pointerDown(slider)
    fireEvent.change(slider, { target: { value: '8' } })
    fireEvent.change(slider, { target: { value: '9' } })
    expect(log).not.toHaveBeenCalled()

    fireEvent.pointerUp(slider)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sleep_quality' }), 9,
    )
  })

  it('commits a keyboard adjustment on keyup', () => {
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)
    const slider = screen.getByRole('slider', { name: /sleep quality/i })

    slider.focus()
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.change(slider, { target: { value: '7' } })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sleep_quality' }), 7,
    )
  })

  it('copies yesterday\'s habits on one tap', async () => {
    yesterdayEntries.set('m3', {
      metric_id: 'm3', logged_on: '2026-09-23', occurrence: 1,
      value_num: null, value_bool: true, value_text: null,
    })
    const user = userEvent.setup()
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)

    await user.click(screen.getByRole('button', { name: /same as yesterday/i }))

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'creatine' }), true,
    )
    // Sliders are judgements about today, so they are never copied.
    expect(log).not.toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sleep_quality' }), expect.anything(),
    )
  })

  it('reports progress', () => {
    entries.set('m3', {
      metric_id: 'm3', logged_on: '2026-09-24', occurrence: 1,
      value_num: null, value_bool: true, value_text: null,
    })
    render(<MorningCard initialDay="2026-09-24" timeZone="Europe/London" />)

    expect(screen.getByText('1 / 1')).toBeVisible()
  })
})
