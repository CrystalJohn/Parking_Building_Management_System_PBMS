import { useCallback, useEffect, useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  getAdminSummary,
  type AdminSummary,
} from '../../lib/admin-api'
import {
  getAllReservations,
  type ManagerReservation,
} from '../../lib/manager-reservations-api'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatVehicleType } from '../../lib/plate-format'
import { cn } from '../../lib/utils'
import { RefreshCw, Loader2, CalendarClock, CheckCircle2, XCircle, Clock, Search, Filter, CalendarIcon } from 'lucide-react'

const POLL_INTERVAL_MS = 30000



function StatusBadge({ status }: { status: string }) {
  let theme = ''
  let icon = null
  let label = status
  let pulse = false

  switch (status.toLowerCase()) {
    case 'active':
      theme = 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:ring-cyan-500/20'
      pulse = true
      break
    case 'fulfilled':
      theme = 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20'
      icon = <CheckCircle2 className="h-3.5 w-3.5" />
      break
    case 'expired':
      theme = 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20'
      icon = <Clock className="h-3.5 w-3.5" />
      break
    case 'cancelled':
      theme = 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20'
      icon = <XCircle className="h-3.5 w-3.5" />
      break
    default:
      theme = 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20'
  }

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset border-transparent hover:${theme.split(' ')[0]} ${theme} capitalize min-w-[80px]`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
        </span>
      )}
      {icon}
      {label}
    </Badge>
  )
}

export default function Reservations() {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [reservations, setReservations] = useState<ManagerReservation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Filter State
  const [filter, setFilter] = useState<'all' | 'active' | 'fulfilled' | 'expired' | 'cancelled'>('all')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dateOpen, setDateOpen] = useState(false)

  const loadReservations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const [summaryData, reservationsData] = await Promise.all([
        getAdminSummary(dateStr),
        getAllReservations(dateStr),
      ])
      setSummary(summaryData)
      setReservations(reservationsData)
      setError(null)
    } catch {
      setError('Unable to load reservations')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedDate])

  useEffect(() => {
    void loadReservations()
    const interval = window.setInterval(() => void loadReservations(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loadReservations])

  // Apply Filter
  const filteredReservations = useMemo(() => {
    if (filter === 'all') return reservations
    return reservations.filter(r => r.status.toLowerCase() === filter)
  }, [reservations, filter])

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Reservations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground font-medium">
              Daily reservation statistics and system-wide booking management.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'rounded-full px-4 shadow-sm justify-start font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date ?? new Date())
                    setDateOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4 shadow-sm"
              onClick={() => void loadReservations(true)}
              disabled={loading || refreshing}
            >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-600" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4 text-cyan-600" />
            )}
            Refresh Data
          </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100 flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            {error}
          </div>
        ) : null}

        {/* Top KPI Cards for Today's Reservation Statistics */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active
                </CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:ring-cyan-800">
                  <CalendarClock className="h-5 w-5" strokeWidth={1.8} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {summary?.reservations.active ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Currently active bookings</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Fulfilled Today
                </CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800">
                  <CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {summary?.reservations.fulfilledToday ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Successfully checked-in</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cancelled Today
                </CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                  <XCircle className="h-5 w-5" strokeWidth={1.8} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {summary?.reservations.cancelledToday ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Cancelled by user/manager</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Expired Today
                </CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800">
                  <Clock className="h-5 w-5" strokeWidth={1.8} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {summary?.reservations.expiredToday ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Lapsed without check-in</p>
            </CardContent>
          </Card>
        </section>

        {/* Filter Bar & Data Table */}
        {!loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/60 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60 flex flex-col">
            
            {/* Filter Segment */}
            <div className="flex flex-col sm:flex-row sm:items-center p-4 border-b border-slate-100 dark:border-white/5 gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Filter by Status:</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-1 bg-slate-100/80 p-1 rounded-xl dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-white/10">
                {['all', 'active', 'fulfilled', 'expired', 'cancelled'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f as typeof filter)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                      filter === f
                        ? 'bg-white shadow-sm text-foreground ring-1 ring-slate-200/50 dark:bg-slate-800 dark:ring-white/10 dark:text-white'
                        : 'text-muted-foreground hover:text-foreground hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/50">
                <TableRow className="hover:bg-transparent border-b-slate-100 dark:border-b-white/5">
                  <TableHead className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                  <TableHead className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Vehicle</TableHead>
                  <TableHead className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Slot Assignment</TableHead>
                  <TableHead className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Timing</TableHead>
                  <TableHead className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReservations.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900 mb-4 ring-1 ring-slate-200 dark:ring-white/10">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="text-base font-semibold text-foreground">No reservations found</p>
                        <p className="text-sm mt-1">There are no reservations matching the current filter criteria.</p>
                        {filter !== 'all' && (
                          <Button variant="outline" size="sm" className="mt-4 rounded-full" onClick={() => setFilter('all')}>
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReservations.map((reservation) => (
                    <TableRow 
                      key={reservation.id} 
                      className="group hover:bg-slate-50/80 dark:hover:bg-slate-900/80 transition-colors duration-200 border-b-slate-100 dark:border-b-white/5"
                    >
                      <TableCell className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500 font-bold dark:bg-slate-800 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10 group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors">
                            {reservation.driver.fullName?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground leading-none mb-1">
                              {reservation.driver.fullName || 'Unnamed'}
                            </div>
                            <div className="text-xs font-medium text-muted-foreground">
                              {reservation.driver.phone || 'No phone'}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        <div>
                          <div className="font-semibold text-foreground leading-none mb-1 uppercase tracking-tight">
                            {(reservation.plateDisplay ?? reservation.licensePlate) || 'N/A'}
                          </div>
                          <div className="text-xs font-semibold text-muted-foreground">
                            {formatVehicleType(reservation.vehicleType)}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        {reservation.slot ? (
                          <div>
                            <div className="font-semibold text-foreground leading-none mb-1">
                              Slot {reservation.slot.code}
                            </div>
                            <div className="text-xs font-medium text-muted-foreground">
                              {reservation.slot.floor ? `Floor ${reservation.slot.floor.floorNumber} (${reservation.slot.floor.name})` : 'Unknown Floor'} · Zone {reservation.slot.zone}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="px-5 py-4">
                        <div className="text-sm font-medium text-foreground">
                          {formatDateTimeVN(reservation.createdAt)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Expires: {formatDateTimeVN(reservation.expiresAt)}
                        </div>
                      </TableCell>

                      <TableCell className="px-5 py-4 text-center">
                        <StatusBadge status={reservation.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="animate-pulse space-y-4">
            <div className="h-[400px] rounded-2xl bg-white/[0.06] border border-border" />
          </div>
        )}
      </div>
    </>
  )
}

