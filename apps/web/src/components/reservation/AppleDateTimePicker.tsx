import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface AppleDateTimePickerProps {
  value?: Date
  onChange: (date: Date) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  minDate?: Date
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MONTHS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
]

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDisplay(date?: Date, placeholder = 'Chọn ngày và giờ'): string {
  if (!date) return placeholder
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} • ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function clampToMin(date: Date, minDate?: Date): Date {
  if (!minDate) return date
  return date < minDate ? new Date(minDate) : date
}

function buildCalendarDays(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const mondayIndex = (first.getDay() + 6) % 7
  const days: (Date | null)[] = Array.from({ length: mondayIndex }, () => null)

  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(new Date(year, month, day))
  }

  while (days.length % 7 !== 0) days.push(null)
  return days
}

export default function AppleDateTimePicker({
  value,
  onChange,
  label = 'Thời gian đặt',
  placeholder = 'Chọn ngày và giờ',
  disabled = false,
  className = '',
  minDate,
}: AppleDateTimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const initialDate = useMemo(() => clampToMin(value ? new Date(value) : new Date(), minDate), [value, minDate])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(initialDate)
  const [viewMonth, setViewMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1))

  const days = useMemo(() => buildCalendarDays(viewMonth), [viewMonth])
  const minDay = minDate ? startOfDay(minDate) : null

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const next = clampToMin(value ? new Date(value) : new Date(), minDate)
    setDraft(next)
    setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1))
  }, [open, value, minDate])

  const updateDatePart = (date: Date) => {
    const next = new Date(date)
    next.setHours(draft.getHours(), draft.getMinutes(), 0, 0)
    setDraft(clampToMin(next, minDate))
  }

  const updateTimePart = (hours: number, minutes: number) => {
    const next = new Date(draft)
    next.setHours(hours, minutes, 0, 0)
    setDraft(clampToMin(next, minDate))
  }

  const applyNow = () => {
    const next = clampToMin(new Date(), minDate)
    setDraft(next)
    setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1))
  }

  const confirm = () => {
    onChange(clampToMin(draft, minDate))
    setOpen(false)
  }

  const cancel = () => {
    setDraft(clampToMin(value ? new Date(value) : new Date(), minDate))
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="group flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
      >
        <span>
          <span className="block text-[11px] font-mono uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
            {label}
          </span>
          <span className="mt-1 block text-[15px] font-semibold text-neutral-950 dark:text-white">
            {formatDisplay(value, placeholder)}
          </span>
        </span>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-500/10 dark:text-blue-300">
          <CalendarDays className="h-5 w-5" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-3 w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-xl shadow-slate-950/10 dark:border-white/10 dark:bg-neutral-950 sm:w-[420px]">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-neutral-950 dark:text-white">
                Chọn thời gian đặt chỗ
              </h3>
              <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
                Chọn ngày và giờ bắt đầu reservation
              </p>
            </div>
            <button
              type="button"
              onClick={cancel}
              className="rounded-xl p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                className="rounded-xl p-2 text-neutral-500 transition hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-[14px] font-semibold text-neutral-900 dark:text-white">
                {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </div>
              <button
                type="button"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                className="rounded-xl p-2 text-neutral-500 transition hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-neutral-400">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-1">{day}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                const disabledDay = !day || Boolean(minDay && startOfDay(day) < minDay)
                const selected = day ? isSameDay(day, draft) : false
                return (
                  <button
                    type="button"
                    key={day?.toISOString() ?? `blank-${index}`}
                    disabled={disabledDay}
                    onClick={() => day && updateDatePart(day)}
                    className={`h-10 rounded-xl text-[13px] font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                      selected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-neutral-700 hover:bg-blue-500/10 dark:text-neutral-200'
                    } disabled:pointer-events-none disabled:text-neutral-300 dark:disabled:text-neutral-700`}
                  >
                    {day?.getDate() ?? ''}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
              <Clock className="h-4 w-4" />
              Wheel picker 24 giờ
            </div>
            <div className="relative grid grid-cols-2 gap-3">
              <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-11 -translate-y-1/2 rounded-xl bg-blue-100/70 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:ring-blue-400/15" />
              <WheelColumn
                label="Giờ"
                values={Array.from({ length: 24 }, (_, hour) => hour)}
                selected={draft.getHours()}
                format={pad}
                onSelect={(hour) => updateTimePart(hour, draft.getMinutes())}
              />
              <WheelColumn
                label="Phút"
                values={Array.from({ length: 60 }, (_, minute) => minute)}
                selected={draft.getMinutes()}
                format={pad}
                onSelect={(minute) => updateTimePart(draft.getHours(), minute)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={applyNow}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-blue-600 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-blue-300 dark:hover:bg-white/10"
            >
              Hôm nay
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                className="rounded-xl px-4 py-2 text-[13px] font-medium text-neutral-600 transition hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-neutral-300 dark:hover:bg-white/10"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirm}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <Check className="h-4 w-4" />
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface WheelColumnProps {
  label: string
  values: number[]
  selected: number
  format: (value: number) => string
  onSelect: (value: number) => void
}

function WheelColumn({ label, values, selected, format, onSelect }: WheelColumnProps) {
  return (
    <div>
      <div className="mb-2 text-center text-[11px] font-mono uppercase tracking-[0.16em] text-neutral-400">
        {label}
      </div>
      <div className="relative h-40 overflow-y-auto rounded-xl px-1 py-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {values.map((value) => {
          const active = value === selected
          return (
            <button
              type="button"
              key={value}
              onClick={() => onSelect(value)}
              className={`relative z-10 mb-1 flex h-10 w-full items-center justify-center rounded-lg text-[18px] font-semibold tabular-nums transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                active
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-neutral-400 hover:bg-white/70 hover:text-neutral-800 dark:hover:bg-white/10 dark:hover:text-white'
              }`}
            >
              {format(value)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
