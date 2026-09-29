'use client'

export function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p
      role="status"
      className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900"
    >
      {count} {count === 1 ? 'entry' : 'entries'} waiting to sync
    </p>
  )
}
