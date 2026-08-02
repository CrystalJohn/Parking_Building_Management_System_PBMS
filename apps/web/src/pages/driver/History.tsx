import { useEffect, useState } from 'react'
import {
  getMyHistory,
  type ParkingSessionHistory,
} from '../../lib/driver-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Car, Bike, History as HistoryIcon, Clock, MapPin, Receipt, CheckCircle2, Timer } from 'lucide-react'

const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`

function formatDuration(checkIn: string, checkOut?: string | null) {
  if (!checkOut) return null
  const start = new Date(checkIn).getTime()
  const end = new Date(checkOut).getTime()
  const diffMs = Math.max(0, end - start)

  const totalSec = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60

  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${String(m).padStart(2, '0')}m`)
  parts.push(`${String(s).padStart(2, '0')}s`)

  return parts.join(' ')
}

export default function History() {
  const [sessions, setSessions] = useState<ParkingSessionHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getMyHistory()
      setSessions(data)
    } catch {
      setError('Unable to load parking history. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
              <HistoryIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Parking History
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Review your completed parking sessions and fee details
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit text-xs font-semibold px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {sessions.length} Completed Session(s)
          </Badge>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-slate-100 dark:bg-slate-900 animate-pulse rounded-2xl border border-slate-200/60 dark:border-slate-800" />
            ))}
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-sm font-medium rounded-xl border border-rose-200 dark:border-rose-900">
            {error}
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <HistoryIcon className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-200">No completed parking sessions</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your completed parking history will appear here once you check out.</p>
          </div>
        )}

        <div className="space-y-3.5">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SessionCard({ session }: { session: ParkingSessionHistory }) {
  const totalFee = (session.feeAmount ?? 0) + (session.penaltyAmount ?? 0)
  const formattedPlate = session.plateDisplay ?? session.licensePlate
  const isMotorbike = session.vehicleType === 'motorbike'
  const durationStr = formatDuration(session.checkInTime, session.checkOutTime)

  return (
    <Card className="overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2.5">
            {/* Vehicle & Type Header */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 tracking-tight">
                {formattedPlate}
              </span>
              <Badge variant="outline" className="gap-1 text-xs font-semibold px-2.5 py-0.5 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                {isMotorbike ? <Bike className="h-3 w-3 text-amber-500" /> : <Car className="h-3 w-3 text-blue-500" />}
                {isMotorbike ? 'Motorbike' : 'Car'}
              </Badge>
              <Badge className="gap-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
                <CheckCircle2 className="h-3 w-3" /> Completed
              </Badge>
            </div>

            {/* Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>
                  Slot: <strong className="text-slate-800 dark:text-slate-200">{session.slot?.code ?? 'N/A'}</strong>
                  {session.slot?.floor?.name ? ` (${session.slot.floor.name})` : ''}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>In: {formatDateTimeVN(session.checkInTime)}</span>
              </div>

              {session.checkOutTime && (
                <div className="flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>Out: {formatDateTimeVN(session.checkOutTime)}</span>
                </div>
              )}

              {durationStr && (
                <div className="flex items-center gap-1.5 font-semibold text-sky-800 dark:text-sky-300">
                  <Timer className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <span>Duration: <strong className="font-mono text-sm font-black text-sky-600 dark:text-sky-400">{durationStr}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Fee & Badges */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium sm:hidden">Total Paid</span>
            <div className="text-right">
              <p className="font-extrabold text-lg sm:text-xl text-slate-900 dark:text-slate-100 tabular-nums">
                {VND(totalFee)}
              </p>
              <div className="flex items-center gap-1 mt-1 justify-end flex-wrap">
                {session.isOvertime && (
                  <Badge variant="secondary" className="text-[10px] bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Overtime
                  </Badge>
                )}
                {session.isLostTicket && (
                  <Badge variant="secondary" className="text-[10px] bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    Lost Ticket
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
