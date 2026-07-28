import { useEffect, useMemo, useState } from 'react'
import { BookmarkCheck, CalendarClock, CheckCircle2, DollarSign, Eye, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import {
  getAdminSessionHistory,
  getAdminSessionEvidence,
  type AdminSessionHistory,
  type AdminSessionEvidence,
} from '../../lib/admin-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatPlateForDisplay, formatVehicleType } from '../../lib/plate-format'
import { EvidenceComparisonPanel } from '@/components/evidence/EvidenceComparisonPanel'
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

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '-'
  if (minutes < 1) return '< 1m'
  const d = Math.floor(minutes / (24 * 60))
  const h = Math.floor((minutes % (24 * 60)) / 60)
  const m = Math.floor(minutes % 60)
  const parts = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  return parts.join(' ')
}

export default function AdminSessions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [history, setHistory] = useState<AdminSessionHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<AdminSessionEvidence | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const selectedDate = resolveSelectedDateParam(searchParams.get('date'))
  const selectedDateValue = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate])

  useEffect(() => {
    void loadHistory(selectedDate)
    const interval = window.setInterval(() => void loadHistory(selectedDate, true), 10000)
    return () => window.clearInterval(interval)
  }, [selectedDate])

  async function loadHistory(date: string, isBackground = false) {
    if (!isBackground) setLoading(true)
    setError(null)
    try {
      const data = await getAdminSessionHistory(date)
      setHistory(data)
    } catch {
      setError('Unable to load session history')
    } finally {
      if (!isBackground) setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadEvidence() {
      if (!selectedSessionId) {
        setSelectedEvidence(null)
        setEvidenceError(null)
        setEvidenceLoading(false)
        return
      }

      setEvidenceLoading(true)
      setEvidenceError(null)
      try {
        const result = await getAdminSessionEvidence(selectedSessionId)
        if (!cancelled) setSelectedEvidence(result)
      } catch {
        if (!cancelled) {
          setSelectedEvidence(null)
          setEvidenceError('Unable to load OCR evidence')
        }
      } finally {
        if (!cancelled) setEvidenceLoading(false)
      }
    }

    void loadEvidence()
    return () => {
      cancelled = true
    }
  }, [selectedSessionId])

  const items = history?.items ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Session History
          </h1>
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
                  return iso > todayIsoDate() || iso < daysAgoIsoDate(60)
                }}
              />
            </PopoverContent>
          </Popover>
          <Button type="button" variant="outline" onClick={() => void loadHistory(selectedDate)} className="h-10">
            <RefreshCw className="mr-2 size-4" strokeWidth={1.8} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          label="Total Completed Sessions"
          value={loading ? '...' : history?.summary.totalSessions ?? 0}
          helper={`Sessions successfully checked out on ${format(selectedDateValue, 'dd/MM/yyyy')}`}
          icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />}
        />
        <MetricCard
          label="Total Revenue"
          value={loading ? '...' : `${(history?.summary.totalRevenue ?? 0).toLocaleString()} VND`}
          helper="Collected from completed sessions today"
          icon={<DollarSign className="h-5 w-5" strokeWidth={1.8} />}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Completed Sessions</CardTitle>
              <CardDescription>
                Detailed log of completed sessions, check-in/out times, duration, and final payment status.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit">
              {items.length} items
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5 py-3">Session</TableHead>
                  <TableHead className="px-5 py-3">Plate</TableHead>
                  <TableHead className="px-5 py-3">Driver</TableHead>
                  <TableHead className="px-5 py-3">Check In</TableHead>
                  <TableHead className="px-5 py-3">Check Out (Duration)</TableHead>
                  <TableHead className="px-5 py-3 text-right">Amount</TableHead>
                  <TableHead className="px-5 py-3 text-right">Payment</TableHead>
                  <TableHead className="px-5 py-3 text-right">Audit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingState />
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-rose-500">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No completed sessions found for this date.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id} className="cursor-default">
                      <TableCell className="px-5 py-3">
                        <div className="font-mono text-xs font-semibold">{item.sessionCode}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.slotCode}
                        </div>
                        {item.reservationId && (
                          <div className="mt-1.5">
                            <span className="inline-flex items-center gap-0.5 rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                              <BookmarkCheck className="size-2.5" />
                              Reservation
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        <div className="font-semibold">{formatPlateForDisplay(item.licensePlate)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatVehicleType(item.vehicleType)}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        <div className="font-medium text-sm">
                          {item.driverName ?? 'Walk-in Guest'}
                        </div>
                        {item.driverPhone && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.driverPhone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-3 text-sm">
                        {formatDateTimeVN(item.checkInTime)}
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        <div className="text-sm font-medium">
                          {item.checkOutTime ? formatDateTimeVN(item.checkOutTime) : '-'}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDuration(item.durationMinutes)}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-right">
                        {item.payment ? (
                          <div className="flex flex-col items-end gap-1">
                              <span className="font-semibold">{item.payment.amount.toLocaleString()} VND</span>
                              <div className="flex flex-col items-end gap-1 mt-0.5">
                                {item.reservationId && (
                                  <Badge className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] uppercase tracking-wider text-emerald-700">
                                    -20% disc.
                                  </Badge>
                                )}
                                {item.isLostTicket && (
                                  <Badge variant="destructive" className="h-4 px-1 text-[9px] uppercase tracking-wider">
                                    Lost Ticket
                                  </Badge>
                                )}
                                {(item.durationMinutes ?? 0) > 24 * 60 && (
                                  <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase tracking-wider bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200">
                                    Overtime
                                  </Badge>
                                )}
                              </div>
                            </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-3 text-right">
                        {item.payment ? (
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline" className="capitalize bg-muted/20">
                              {item.payment.method.replace('_', ' ')}
                            </Badge>
                            {item.payment.status === 'completed' ? (
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                PAID
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                                {item.payment.status}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary">Free / No Payment</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedSessionId(item.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="View Evidence"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={selectedSessionId !== null}
        onOpenChange={(open) => !open && setSelectedSessionId(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-3xl">
          <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
            <SheetHeader className="border-b pb-4">
              <SheetTitle>Evidence Audit</SheetTitle>
              <SheetDescription>
                Compare check-in and check-out OCR captures for the selected session.
              </SheetDescription>
            </SheetHeader>

            {evidenceLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-[200px] w-full" />
                <Skeleton className="h-[200px] w-full" />
              </div>
            ) : null}

            {evidenceError ? (
              <Card className="border-destructive/30 bg-destructive/10 text-destructive">
                <CardContent className="py-4 font-semibold">{evidenceError}</CardContent>
              </Card>
            ) : null}

            {!evidenceLoading && !evidenceError && selectedEvidence ? (
              <EvidenceComparisonPanel
                checkInEvidence={selectedEvidence.checkInEvidence}
                checkOutEvidence={selectedEvidence.checkOutEvidence}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string
  value: React.ReactNode
  helper: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 7 }).map((_, j) => (
            <TableCell key={j} className="px-5 py-3">
              <Skeleton className="h-5 w-full max-w-[120px]" />
              <Skeleton className="mt-2 h-3 w-full max-w-[80px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

function todayIsoDate() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  const localDate = new Date(now.getTime() - offsetMs)
  return localDate.toISOString().split('T')[0]
}

function daysAgoIsoDate(days: number) {
  const now = new Date()
  now.setDate(now.getDate() - days)
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  const localDate = new Date(now.getTime() - offsetMs)
  return localDate.toISOString().split('T')[0]
}

function resolveSelectedDateParam(raw: string | null) {
  if (!raw) return todayIsoDate()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return todayIsoDate()
  return raw
}
