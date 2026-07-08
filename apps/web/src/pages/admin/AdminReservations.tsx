import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Clock3, History, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import { getAdminReservationAudit, type AdminReservationAudit, type AdminReservationAuditItem } from '../../lib/admin-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export default function AdminReservations() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [audit, setAudit] = useState<AdminReservationAudit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<AdminReservationAuditItem | null>(null)

  const selectedDate = resolveSelectedDateParam(searchParams.get('date'))
  const selectedDateValue = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate])

  useEffect(() => {
    void loadAudit(selectedDate)
  }, [selectedDate])

  async function loadAudit(date: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await getAdminReservationAudit(date)
      setAudit(data)
    } catch {
      setError('Unable to load reservation audit')
    } finally {
      setLoading(false)
    }
  }

  const watchlist = audit?.watchlist ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Reservation Audit
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Monitor reserved capacity, expiring holds, expired reservations, and fulfilled QR reservation check-ins without entering gate workflows.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => setSearchParams({ date: todayIsoDate() })}
            className="h-10"
          >
            Today
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-10 min-w-[160px] justify-start">
                <CalendarClock className="mr-2 size-4" strokeWidth={1.8} />
                {format(selectedDateValue, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-3">
              <Calendar
                mode="single"
                selected={selectedDateValue}
                onSelect={(date) => {
                  if (!date) return
                  setSearchParams({ date: format(date, 'yyyy-MM-dd') })
                }}
                disabled={(date) => {
                  const iso = format(date, 'yyyy-MM-dd')
                  return iso > todayIsoDate() || iso < daysAgoIsoDate(30)
                }}
              />
            </PopoverContent>
          </Popover>
          <Button type="button" variant="outline" onClick={() => void loadAudit(selectedDate)} className="h-10">
            <RefreshCw className="mr-2 size-4" strokeWidth={1.8} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Currently reserved"
          value={loading ? '...' : audit?.summary.currentlyReserved ?? 0}
          helper="Active reservations currently holding reserved slots"
          icon={<CalendarClock className="h-5 w-5" strokeWidth={1.8} />}
        />
        <MetricCard
          label="Expiring soon"
          value={loading ? '...' : audit?.summary.expiringSoon ?? 0}
          helper="Active reservations expiring within 5 minutes"
          icon={<Clock3 className="h-5 w-5" strokeWidth={1.8} />}
        />
        <MetricCard
          label="Expired today"
          value={loading ? '...' : audit?.summary.expiredToday ?? 0}
          helper={`Expired on ${format(selectedDateValue, 'dd/MM/yyyy')}`}
          icon={<History className="h-5 w-5" strokeWidth={1.8} />}
        />
        <MetricCard
          label="Fulfilled today"
          value={loading ? '...' : audit?.summary.fulfilledToday ?? 0}
          helper="Reservation QR check-ins linked to sessions"
          icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Reservation Watchlist</CardTitle>
              <CardDescription>
                Active holds, expiring reservations, recent expiries, and fulfilled QR reservations.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit">
              {watchlist.length} items
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-5">
                <LoadingRows rows={6} />
              </div>
            ) : error ? (
              <div className="p-5">
                <AuditEmptyState
                  title="Reservation audit is unavailable"
                  description={error}
                />
              </div>
            ) : watchlist.length === 0 ? (
              <div className="p-5">
                <AuditEmptyState
                  title="No reservation activity needs attention"
                  description="No active reserved holds, expiring reservations, or selected-day reservation events were returned."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="px-5 py-3">Plate</TableHead>
                    <TableHead className="px-5 py-3">Driver</TableHead>
                    <TableHead className="px-5 py-3">Slot</TableHead>
                    <TableHead className="px-5 py-3">Status</TableHead>
                    <TableHead className="px-5 py-3">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {watchlist.map((item) => (
                    <TableRow
                      key={item.id}
                      className={cn('cursor-pointer', item.status === 'active' && item.timeLeftMinutes !== null && item.timeLeftMinutes <= 5 && 'bg-amber-50/70 dark:bg-amber-500/10')}
                      onClick={() => setSelectedItem(item)}
                    >
                      <TableCell className="px-5 py-4">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-black text-foreground">
                            {formatPlate(item.plateNumber)}
                          </p>
                          <p className="mt-1 text-xs font-medium text-muted-foreground">
                            {item.vehicleType ? titleCase(item.vehicleType) : 'Vehicle not linked'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <p className="text-sm font-semibold text-foreground">
                          {item.driverName ?? 'Unknown driver'}
                        </p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {item.driverPhone ?? 'No phone'}
                        </p>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <p className="text-sm font-semibold text-foreground">
                          {item.slotCode ?? 'No slot'}
                        </p>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <ReservationStatusBadge item={item} />
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <p className="text-sm font-semibold text-foreground">
                          {timeLabel(item)}
                        </p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {subTimeLabel(item)}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <Sheet open={selectedItem !== null} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          {selectedItem ? (
            <>
              <SheetHeader className="border-b pb-4">
                <SheetTitle>Reservation detail</SheetTitle>
                <SheetDescription>
                  Read-only audit context for reservation {selectedItem.id}.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-3 p-4">
                <DetailRow label="Reservation ID" value={selectedItem.id} mono />
                <DetailRow label="Driver" value={selectedItem.driverName ?? 'Unknown driver'} />
                <DetailRow label="Phone" value={selectedItem.driverPhone ?? 'No phone'} />
                <DetailRow label="Plate" value={formatPlate(selectedItem.plateNumber)} mono />
                <DetailRow label="Slot" value={selectedItem.slotCode ?? 'No slot'} />
                <DetailRow label="Status" value={titleCase(selectedItem.status.replace('_', ' '))} />
                <DetailRow label="Created time" value={formatDateTimeVN(selectedItem.createdAt)} />
                <DetailRow label="Expires time" value={selectedItem.expiresAt ? formatDateTimeVN(selectedItem.expiresAt) : 'No expiry'} />
                <DetailRow label="Fulfilled session code" value={selectedItem.fulfilledSessionCode ?? 'Not fulfilled'} mono />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ReservationStatusBadge({ item }: { item: AdminReservationAuditItem }) {
  if (item.status === 'active' && item.timeLeftMinutes !== null && item.timeLeftMinutes <= 5) {
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/15 dark:text-amber-100">Expiring soon</Badge>
  }

  if (item.status === 'active') {
    return <Badge variant="outline" className="border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-400/20 dark:bg-primary-500/15 dark:text-primary-100">Reserved</Badge>
  }

  if (item.status === 'fulfilled') {
    return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/15 dark:text-emerald-100">Fulfilled</Badge>
  }

  if (item.status === 'expired') {
    return <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/15 dark:text-rose-100">Expired</Badge>
  }

  return <Badge variant="outline">{titleCase(item.status)}</Badge>
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-950/60">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn('text-right text-sm font-black text-slate-900 dark:text-slate-100', mono && 'font-mono')}>
        {value}
      </p>
    </div>
  )
}

function timeLabel(item: AdminReservationAuditItem) {
  if (item.status === 'active') {
    if (item.timeLeftMinutes === null) return 'No expiry'
    return item.timeLeftMinutes <= 0 ? 'Expired hold' : `${item.timeLeftMinutes}m left`
  }

  if (item.status === 'fulfilled') {
    return item.fulfilledAt ? `Fulfilled ${formatShortTime(item.fulfilledAt)}` : 'Fulfilled'
  }

  return item.expiresAt ? `Expired ${formatShortTime(item.expiresAt)}` : 'Expired'
}

function subTimeLabel(item: AdminReservationAuditItem) {
  if (item.status === 'active') {
    return item.expiresAt ? `Expires ${formatDateTimeVN(item.expiresAt)}` : `Created ${formatDateTimeVN(item.createdAt)}`
  }
  if (item.status === 'fulfilled') {
    return item.fulfilledAt ? `Session ${item.fulfilledSessionCode ?? 'linked'}` : `Created ${formatDateTimeVN(item.createdAt)}`
  }
  return item.expiresAt ? `Created ${formatDateTimeVN(item.createdAt)}` : 'No expiry timestamp'
}

function formatShortTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatPlate(value: string | null) {
  return value ?? 'No plate'
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function todayIsoDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
}

function daysAgoIsoDate(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
}

function resolveSelectedDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return todayIsoDate()
  return value
}

function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string
  value: string | number
  helper: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-muted-foreground">{label}</div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-black tracking-tight text-foreground">{value}</div>
        <div className="mt-1 text-xs font-medium text-muted-foreground">{helper}</div>
      </CardContent>
    </Card>
  )
}

function AuditEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="p-8 text-center">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}

function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  )
}
