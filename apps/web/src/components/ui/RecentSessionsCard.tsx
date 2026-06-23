import { useEffect, useState, useCallback } from 'react'
import { getRecentSessions, type RecentSession, type SessionStatus } from '../../lib/sessions-api'
import { formatDateTimeVN } from '../../lib/date-time'

interface Props {
  type: 'checkin' | 'checkout'
  /** Pass a trigger value that increments each time a new action completes to auto-refresh */
  refreshTrigger?: number
}

const VND = (n: number) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n))} VND`

function statusLabel(status: SessionStatus): { text: string; cls: string } {
  const map: Record<SessionStatus, { text: string; cls: string }> = {
    active:           { text: 'Parked',       cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
    checkout_pending: { text: 'Awaiting',     cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    exit_authorized:  { text: 'Exit Auth',    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    completed:        { text: 'Completed',    cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
    cancelled:        { text: 'Cancelled',    cls: 'bg-rose-50 text-rose-600 ring-rose-200' },
  }
  return map[status] ?? { text: status, cls: 'bg-slate-100 text-slate-600 ring-slate-200' }
}

function vehicleIcon(type: 'car' | 'motorbike') {
  return type === 'car' ? '🚗' : '🏍️'
}

export function RecentSessionsCard({ type, refreshTrigger = 0 }: Props) {
  const [sessions, setSessions] = useState<RecentSession[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await getRecentSessions(type, 20)
      setSessions(data)
    } catch {
      // Silent — history is non-critical
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  const title = type === 'checkin' ? 'Check-in History' : 'Check-out History'
  const emptyText = type === 'checkin' ? 'No check-in history yet' : 'No check-out history yet'
  const timeLabel = type === 'checkin' ? 'Check-in time' : 'Check-out time'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
          {title}
        </p>
        <button
          onClick={() => void load()}
          className="text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors"
          aria-label="Refresh"
        >
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-slate-400 font-semibold">
          Loading...
        </div>
      ) : sessions.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400 font-semibold">
          {emptyText}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
          {sessions.map((s) => {
            const { text, cls } = statusLabel(s.status)
            const time = type === 'checkin' ? s.checkInTime : (s.checkOutTime ?? s.checkInTime)
            const fee = s.feeAmount + s.penaltyAmount

            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                {/* Vehicle icon */}
                <span className="text-xl shrink-0">{vehicleIcon(s.vehicleType)}</span>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-black text-sm text-slate-950">
                      {s.licensePlate}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${cls}`}>
                      {text}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-medium flex-wrap">
                    <span className="font-mono">{s.slot.code}</span>
                    <span>·</span>
                    <span>{s.slot.floor} / Zone {s.slot.zone}</span>
                    {fee > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-semibold text-slate-700">{VND(fee)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Time */}
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-slate-400 font-medium">{timeLabel}</p>
                  <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                    {formatDateTimeVN(time)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
