import { useCallback, useEffect, useState } from 'react'
import {
  getAdminSummary,
  type AdminSummary,
} from '../../lib/admin-api'
import {
  getAllReservations,
  type ManagerReservation,
} from '../../lib/manager-reservations-api'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTimeVN } from '../../lib/date-time'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2, CalendarClock, CheckCircle2, XCircle, Clock } from 'lucide-react'

const POLL_INTERVAL_MS = 30000

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'active':
      return 'default'
    case 'fulfilled':
      return 'outline'
    case 'expired':
      return 'destructive'
    case 'cancelled':
      return 'secondary'
    default:
      return 'outline'
  }
}

export default function Reservations() {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [reservations, setReservations] = useState<ManagerReservation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadReservations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const [summaryData, reservationsData] = await Promise.all([
        getAdminSummary(),
        getAllReservations(),
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
  }, [])

  useEffect(() => {
    void loadReservations()
    const interval = window.setInterval(() => void loadReservations(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loadReservations])

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Reservations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Daily reservation statistics and system-wide reservation management.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadReservations(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Refresh
          </Button>
        </div>
        
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100">
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

        {/* Detailed Reservations Table */}
        {!loading ? (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-3">Customer</TableHead>
                  <TableHead className="px-4 py-3">Vehicle</TableHead>
                  <TableHead className="px-4 py-3">Slot Assignment</TableHead>
                  <TableHead className="px-4 py-3">Timing</TableHead>
                  <TableHead className="px-4 py-3 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No reservations found in the system.
                    </TableCell>
                  </TableRow>
                ) : (
                  reservations.map((reservation) => (
                    <TableRow key={reservation.id}>
                      <TableCell className="px-4 py-3">
                        <div className="font-medium">{reservation.driver.fullName || 'Unnamed'}</div>
                        <div className="text-xs text-muted-foreground">{reservation.driver.phone || 'No phone'}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="font-medium uppercase">{reservation.licensePlate || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground capitalize">{reservation.vehicleType}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {reservation.slot ? (
                          <>
                            <div className="font-medium">Slot {reservation.slot.code}</div>
                            <div className="text-xs text-muted-foreground">
                              {reservation.slot.floor ? `Floor ${reservation.slot.floor.floorNumber} (${reservation.slot.floor.name})` : 'Unknown Floor'} · Zone {reservation.slot.zone}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="text-sm">{formatDateTimeVN(reservation.createdAt)}</div>
                        <div className="text-xs text-muted-foreground">Expires: {formatDateTimeVN(reservation.expiresAt)}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <Badge variant={getStatusBadgeVariant(reservation.status)} className="capitalize">
                          {reservation.status}
                        </Badge>
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
