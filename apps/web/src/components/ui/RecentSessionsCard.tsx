import { useCallback, useEffect, useState } from 'react'
import { Bike, Car, Clock3, RefreshCw, WalletCards } from 'lucide-react'
import { getRecentSessions, type RecentSession, type SessionStatus } from '../../lib/sessions-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Props {
  type: 'checkin' | 'checkout'
  /** Pass a trigger value that increments each time a new action completes to auto-refresh */
  refreshTrigger?: number
}

const VND = (n: number) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n))} VND`

function statusLabel(status: SessionStatus): { text: string; className: string } {
  const map: Record<SessionStatus, { text: string; className: string }> = {
    active: {
      text: 'Parked',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    checkout_pending: {
      text: 'Awaiting',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    exit_authorized: {
      text: 'Exit Auth',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    completed: {
      text: 'Completed',
      className: 'border-slate-200 bg-slate-100 text-slate-700',
    },
    cancelled: {
      text: 'Cancelled',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    },
  }

  return map[status] ?? {
    text: status,
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  }
}

function HistorySkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function RecentSessionsCard({ type, refreshTrigger = 0 }: Props) {
  const [sessions, setSessions] = useState<RecentSession[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getRecentSessions(type, 20)
      setSessions(data)
    } catch {
      // History is non-critical. Keep the gate workflow usable if this request fails.
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  const title = type === 'checkin' ? 'Check-in history' : 'Check-out history'
  const description = type === 'checkin' ? 'Latest vehicle entries' : 'Latest vehicle exits'
  const emptyText = type === 'checkin' ? 'No check-in history yet' : 'No check-out history yet'
  const timeLabel = type === 'checkin' ? 'Check-in time' : 'Check-out time'

  return (
    <Card className="overflow-hidden">
      <CardHeader className="grid-cols-[1fr_auto] border-b bg-muted/30 p-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock3 className="size-4 text-primary" />
            {title}
          </CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh recent sessions"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <HistorySkeleton />
        ) : sessions.length === 0 ? (
          <div className="grid min-h-32 place-items-center px-4 py-8 text-center">
            <div className="space-y-2">
              <div className="mx-auto grid size-10 place-items-center rounded-lg border bg-background text-muted-foreground">
                <WalletCards className="size-5" />
              </div>
              <p className="text-sm font-medium text-foreground">{emptyText}</p>
              <p className="text-xs text-muted-foreground">
                Completed gate actions will appear here.
              </p>
            </div>
          </div>
        ) : (
          <ul className="max-h-[260px] divide-y overflow-y-auto">
            {sessions.map((session) => {
              const { text, className } = statusLabel(session.status)
              const isCheckoutHistory = type === 'checkout'
              const time =
                type === 'checkin'
                  ? session.checkInTime
                  : (session.checkOutTime ?? session.checkInTime)
              const fee = session.feeAmount + session.penaltyAmount
              const VehicleIcon = session.vehicleType === 'car' ? Car : Bike

              return (
                <li
                  key={session.id}
                  className="px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
                          {session.licensePlate}
                        </span>
                        {isCheckoutHistory ? (
                          <Badge variant="outline" className={cn('h-5', className)}>
                            {text}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono font-medium text-foreground">
                          {session.slot.code}
                        </span>
                        <span>/</span>
                        <span className="inline-flex items-center gap-1 capitalize">
                          <VehicleIcon className="size-3.5" />
                          {session.vehicleType}
                        </span>
                        {isCheckoutHistory ? (
                          <>
                            <span>/</span>
                            <span>
                              {session.slot.floor} / Z{session.slot.zone}
                            </span>
                          </>
                        ) : null}
                        {isCheckoutHistory && fee > 0 ? (
                          <>
                            <span>/</span>
                            <span className="font-medium text-foreground">{VND(fee)}</span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-medium text-muted-foreground">{timeLabel}</p>
                      <p className="mt-1 text-xs font-semibold tabular-nums text-foreground">
                        {formatDateTimeVN(time)}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
