'use client'

export function SameAsYesterday({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] w-full rounded-xl border border-neutral-300
                 bg-white text-sm font-medium"
    >
      Same as yesterday
    </button>
  )
}
