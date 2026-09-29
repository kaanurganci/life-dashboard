'use client'

import { useRef, useState } from 'react'
import type { Metric } from '@/lib/schemas'

export function MetricSlider({
  metric, value, onChange,
}: {
  metric: Metric
  value: number | null
  onChange: (next: number) => void
}) {
  const min = metric.scale_min ?? 1
  const max = metric.scale_max ?? 10
  const [draft, setDraft] = useState(value ?? Math.round((min + max) / 2))
  const dragging = useRef(false)

  // Resync the draft when the committed value changes underneath us (e.g. a
  // reload, or the optimistic write settling with a server value). Adjusting
  // state during render rather than in a useEffect avoids the extra
  // cascading-render pass react-hooks/set-state-in-effect warns about; see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-based-on-a-prop
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (value !== null) setDraft(value)
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-base">{metric.label}</span>
        <span className="text-2xl font-semibold tabular-nums">{draft}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={draft}
        aria-label={metric.label}
        onPointerDown={() => { dragging.current = true }}
        onPointerUp={() => { dragging.current = false; onChange(draft) }}
        onChange={(e) => setDraft(Number(e.target.value))}
        onKeyUp={() => { if (!dragging.current) onChange(draft) }}
        className="mt-3 h-11 w-full accent-emerald-600"
      />
    </div>
  )
}
