'use client'

import type { Metric } from '@/lib/schemas'

export function MetricToggle({
  metric, value, onChange,
}: {
  metric: Metric
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex min-h-[52px] items-center justify-between gap-3
                      rounded-xl bg-white px-4 shadow-sm">
      <span className="text-base">{metric.label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={metric.label}
        onClick={() => onChange(!value)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors
          ${value ? 'bg-emerald-600' : 'bg-neutral-300'}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all
            ${value ? 'left-7' : 'left-1'}`}
        />
      </button>
    </label>
  )
}
