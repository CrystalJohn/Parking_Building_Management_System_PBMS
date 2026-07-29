import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
import {
  getAdminSessionHistory,
  getAdminSessionEvidence,
  type AdminSessionHistory,
  type AdminSessionHistoryItem,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '-'
  if (minutes < 1) return '< 1m'
  const d = Math.floor(minutes / (24 * 60))
  const h = Math.floor((minutes % (24 * 60)) / 60)
  const m = Math.floor(minutes % 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  return parts.join(' ')
}

type StatusFilter = 'all' | 'active' | 'completed'
type VehicleFilter = 'all' | 'car' | 'motorbike'

// ─── Status Badge ─────────────────────────────────────────────────────────────

function SessionStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-400/30 font-semibold text-[10px] px-1.5 py-0.5">
          Parked
        </Badge>
      )
    case 'checkout_pending':
    case 'exit_authorized':
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-400/30 font-semibold text-[10px] px-1.5 py-0.5">
          Exiting
        </Badge>
      )
    case 'completed':
      return (
        <Badge className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-400/20 font-semibold text-[10px] px-1.5 py-0.5">
          Completed
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-[10px] capitalize">
          {status}
        </Badge>
      )
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminSessions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [history, setHistory] = useState<AdminSessionHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)

  // filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>('all')

  // audit sheet
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<AdminSessionEvidence | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const selectedDate = resolveSelectedDateParam(searchParams.get('date'))
  const selectedDateValue = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate])
  const isToday = selectedDate === todayIsoDate()

  // ── Auto-refresh every 10s when viewing today ──
  useEffect(() => {
    void loadHistory(selectedDate)
    if (isToday) {
      const interval = window.setInterval(() => void loadHistory(selectedDate, true), 10000)
      return () => window.clearInterval(interval)
    }
  }, [selectedDate, isToday])

  async function loadHistory(date: string, isBackground = false) {
    if (!isBackground) setLoading(true)
    setError(null)
    try {
      const data = await getAdminSessionHistory(date)
      setHistory(data)
      if (isBackground) setIsLive(true)
    } catch {
      setError('Unable to load session history')
    } finally {
      if (!isBackground) setLoading(false)
    }
  }

  // ── Load evidence when sheet opens ──
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
    return () => { cancelled = true }
  }, [selectedSessionId])

  // ── Derived stats from raw items ──
  const allItems = history?.items ?? []

  const activeSessions  = allItems.filter((i) => i.status === 'active')
  const exitingSessions = allItems.filter((i) => i.status === 'checkout_pending' || i.status === 'exit_authorized')
  const completedSessions = allItems.filter((i) => i.status === 'completed')

  const activeCars       = activeSessions.filter((i) => i.vehicleType === 'car').length
  const activeMotorbikes = activeSessions.filter((i) => i.vehicleType === 'motorbike').length

  // ── Apply filters ──
  const filteredItems = useMemo<AdminSessionHistoryItem[]>(() => {
    let base = allItems

    // Status filter
    if (statusFilter === 'active') {
      base = base.filter((i) => i.status === 'active' || i.status === 'checkout_pending' || i.status === 'exit_authorized')
    } else if (statusFilter === 'completed') {
      base = base.filter((i) => i.status === 'completed')
    }

    // Vehicle type filter
    if (vehicleFilter !== 'all') {
      base = base.filter((i) => i.vehicleType === vehicleFilter)
    }

    // Sort: active first, then by checkInTime desc
    return [...base].sort((a, b) => {
      const statusOrder = (s: string) =>
        s === 'active' ? 0 : s === 'checkout_pending' || s === 'exit_authorized' ? 1 : 2
      const so = statusOrder(a.status) - statusOrder(b.status)
      if (so !== 0) return so
      return new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime()
    })
  }, [allItems, statusFilter, vehicleFilter])

  return (
    <div className="space-y-5">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Session History</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            All vehicles checked in on the selected date.
            {isToday && isLive && (
              <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">
                Live
              </span>
            )}
          </p>
        </div>

        {/* Date controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={isToday ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchParams({ date: todayIsoDate() })}
          >
            Today
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="min-w-[120px] justify-center">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadHistory(selectedDate)}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary Strip ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryCard
          label="Currently Parked"
          value={loading ? '—' : activeSessions.length}
          sub={loading ? '' : `${activeCars} car · ${activeMotorbikes} motorbike`}
          accent="emerald"
          live={isToday}
          onClick={() => { setStatusFilter('active'); setVehicleFilter('all') }}
          active={statusFilter === 'active' && vehicleFilter === 'all'}
        />
        <SummaryCard
          label="Cars Parked"
          value={loading ? '—' : activeCars}
          sub="Cars currently parked"
          accent="emerald"
          onClick={() => { setStatusFilter('active'); setVehicleFilter('car') }}
          active={statusFilter === 'active' && vehicleFilter === 'car'}
        />
        <SummaryCard
          label="Motorbikes Parked"
          value={loading ? '—' : activeMotorbikes}
          sub="Motorbikes currently parked"
          accent="emerald"
          onClick={() => { setStatusFilter('active'); setVehicleFilter('motorbike') }}
          active={statusFilter === 'active' && vehicleFilter === 'motorbike'}
        />
        <SummaryCard
          label="Checked Out Today"
          value={loading ? '—' : completedSessions.length}
          sub={`+${exitingSessions.length} exiting`}
          onClick={() => { setStatusFilter('completed'); setVehicleFilter('all') }}
          active={statusFilter === 'completed'}
        />
        <SummaryCard
          label="Revenue"
          value={loading ? '—' : `${(history?.summary.totalRevenue ?? 0).toLocaleString()}`}
          sub="VND · completed sessions"
        />
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status quick-filter */}
        <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
          {(
            [
              { key: 'all', label: 'All', count: allItems.length },
              { key: 'active', label: 'Active', count: activeSessions.length + exitingSessions.length },
              { key: 'completed', label: 'Completed', count: completedSessions.length },
            ] as { key: StatusFilter; label: string; count: number }[]
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                statusFilter === opt.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
              <span className="ml-1.5 tabular-nums opacity-70">{opt.count}</span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-border" />

        {/* Vehicle type filter */}
        <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
          {(
            [
              { key: 'all', label: 'All Types' },
              { key: 'car', label: 'Car' },
              { key: 'motorbike', label: 'Motorbike' },
            ] as { key: VehicleFilter; label: string }[]
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setVehicleFilter(opt.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                vehicleFilter === opt.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Clear filters */}
        {(statusFilter !== 'all' || vehicleFilter !== 'all') && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => { setStatusFilter('all'); setVehicleFilter('all') }}
          >
            Clear filters
          </Button>
        )}

        <div className="ml-auto">
          <Badge variant="outline" className="text-xs">
            {filteredItems.length} session{filteredItems.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="px-4 py-3 w-[160px]">Session / Slot</TableHead>
                <TableHead className="px-4 py-3">Vehicle</TableHead>
                <TableHead className="px-4 py-3">Driver</TableHead>
                <TableHead className="px-4 py-3 w-[110px]">Status</TableHead>
                <TableHead className="px-4 py-3">Check In</TableHead>
                <TableHead className="px-4 py-3">Duration</TableHead>
                <TableHead className="px-4 py-3 text-right">Amount</TableHead>
                <TableHead className="px-4 py-3 text-right w-16">Audit</TableHead>
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
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No sessions match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow
                    key={item.id}
                    className={`cursor-default transition-colors ${
                      item.status === 'active'
                        ? 'bg-emerald-500/5 hover:bg-emerald-500/8'
                        : item.status === 'checkout_pending' || item.status === 'exit_authorized'
                          ? 'bg-amber-500/5 hover:bg-amber-500/8'
                          : 'hover:bg-muted/40'
                    }`}
                  >
                    {/* Session / Slot */}
                    <TableCell className="px-4 py-3">
                      <div className="font-mono text-xs font-semibold tracking-wide text-foreground">
                        {item.sessionCode ?? '—'}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {[item.floorName, item.slotCode].filter(Boolean).join(' · ') || '—'}
                      </div>
                      {item.reservationId && (
                        <span className="mt-1 inline-block rounded-sm bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          Reserved
                        </span>
                      )}
                    </TableCell>

                    {/* Vehicle */}
                    <TableCell className="px-4 py-3">
                      <div className="font-semibold tracking-wide">{formatPlateForDisplay(item.licensePlate)}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatVehicleType(item.vehicleType)}
                      </div>
                    </TableCell>

                    {/* Driver */}
                    <TableCell className="px-4 py-3">
                      <div className="text-sm font-medium">{item.driverName ?? 'Walk-in'}</div>
                      {item.driverPhone && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{item.driverPhone}</div>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="px-4 py-3">
                      <SessionStatusBadge status={item.status} />
                    </TableCell>

                    {/* Check In */}
                    <TableCell className="px-4 py-3 text-sm tabular-nums">
                      {formatDateTimeVN(item.checkInTime)}
                    </TableCell>

                    {/* Duration */}
                    <TableCell className="px-4 py-3">
                      {item.checkOutTime ? (
                        <div className="text-sm tabular-nums">{formatDuration(item.durationMinutes)}</div>
                      ) : item.durationMinutes != null ? (
                        <div className="text-sm text-emerald-700 dark:text-emerald-400 tabular-nums font-medium">
                          {formatDuration(item.durationMinutes)}
                          <span className="ml-1 text-[10px] text-muted-foreground font-normal">elapsed</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="px-4 py-3 text-right">
                      {item.payment ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold text-sm tabular-nums">
                            {item.payment.amount.toLocaleString()}
                            <span className="text-[10px] font-normal text-muted-foreground ml-0.5">VND</span>
                          </span>
                          <div className="flex items-center gap-1">
                            {item.payment.status === 'completed' ? (
                              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">PAID</span>
                            ) : (
                              <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">{item.payment.status}</span>
                            )}
                            {item.reservationId && (
                              <Badge className="h-3.5 border-emerald-500/30 bg-emerald-500/10 px-1 text-[8px] uppercase tracking-wider text-emerald-700">
                                -20%
                              </Badge>
                            )}
                          </div>
                        </div>
                      ) : item.status === 'active' ? (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Audit */}
                    <TableCell className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedSessionId(item.id)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Evidence Audit Sheet ─────────────────────────────────── */}
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

// ─── Summary Card (clickable filter shortcut) ────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  accent,
  live,
  onClick,
  active,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: 'emerald'
  live?: boolean
  onClick?: () => void
  active?: boolean
}) {
  return (
    <Card
      onClick={onClick}
      className={`transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      } ${
        active
          ? 'ring-2 ring-emerald-500/50 border-emerald-500/30'
          : ''
      }`}
    >
      <CardHeader className="p-4 pb-1 flex flex-row items-start justify-between space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        {live && (
          <span className="text-[10px] text-emerald-600 font-semibold">
            Live
          </span>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <div className={`text-2xl font-bold tabular-nums ${accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
          {value}
        </div>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 8 }).map((_, j) => (
            <TableCell key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full max-w-[100px]" />
              <Skeleton className="mt-1.5 h-3 w-full max-w-[60px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ─── Date utils ───────────────────────────────────────────────────────────────

function todayIsoDate() {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().split('T')[0]
}

function daysAgoIsoDate(days: number) {
  const now = new Date()
  now.setDate(now.getDate() - days)
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().split('T')[0]
}

function resolveSelectedDateParam(raw: string | null) {
  if (!raw) return todayIsoDate()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return todayIsoDate()
  return raw
}
