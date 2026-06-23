export type DurationValue = '1h' | '2h' | '3h' | '4h' | '6h' | 'day'

interface DurationSelectProps {
  value: DurationValue
  onChange: (value: DurationValue) => void
  disabled?: boolean
  className?: string
}

const OPTIONS: { value: DurationValue; label: string; detail: string }[] = [
  { value: '1h', label: '1 hr', detail: 'Quick' },
  { value: '2h', label: '2 hr', detail: 'Popular' },
  { value: '3h', label: '3 hr', detail: 'Flexible' },
  { value: '4h', label: '4 hr', detail: 'Half day' },
  { value: '6h', label: '6 hr', detail: 'Extended' },
  { value: 'day', label: 'All day', detail: 'All-day' },
]

export default function DurationSelect({ value, onChange, disabled = false, className = '' }: DurationSelectProps) {
  return (
    <div className={className}>
      <div className="mb-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
          Expected duration
        </div>
        <div className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          Used to estimate the reservation window.
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const active = option.value === value
          return (
            <button
              type="button"
              key={option.value}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`rounded-2xl border px-4 py-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50 ${
                active
                  ? 'border-blue-500/40 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10'
                  : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'
              }`}
            >
              <span className={`block text-[15px] font-semibold ${active ? 'text-blue-700 dark:text-blue-200' : 'text-neutral-900 dark:text-white'}`}>
                {option.label}
              </span>
              <span className="mt-0.5 block text-[11px] text-neutral-500 dark:text-neutral-400">
                {option.detail}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
