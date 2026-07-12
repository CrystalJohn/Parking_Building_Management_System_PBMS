import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, isAfter, isBefore, isSameDay, isValid, parseISO, startOfDay, subDays } from 'date-fns'
import {
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  ParkingCircle,
  RefreshCcw,
  Timer,
} from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Calendar } from '../../components/ui/calendar'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import {
  getAdminPendingPayments,
  getAdminSummary,
  type AdminPendingPaymentItem,
  type AdminPendingPayments,
  type AdminSummary,
  type PaymentMonitoringRisk,
} from '../../lib/admin-api'
import { useToasts } from '../../lib/use-toasts'
import { AdminPageHeader, EmptyState, LoadingRows } from './admin-ui'

const API_DATE_FORMAT = 'yyyy-MM-dd'
const DISPLAY_DATE_FORMAT = 'dd/MM/yyyy'

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [pendingPayments, setPendingPayments] = useState<AdminPendingPayments | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [today] = useState(() => startOfDay(new Date()))
  const toasts = useToasts()

  const minDate = useMemo(() => subDays(today, 30), [today])
  const selectedDate = useMemo(
    () => clampDashboardDate(parseDashboardDate(searchParams.get('date')) ?? today, minDate, today),
    [minDate, searchParams, today],
  )
  const selectedDateString = format(selectedDate, API_DATE_FORMAT)
  const selectedDateLabel = format(selectedDate, DISPLAY_DATE_FORMAT)
  const selectedDateIsToday = isSameDay(selectedDate, today)

  useEffect(() => {
    const currentParam = searchParams.get('date')
    if (currentParam && currentParam !== selectedDateString) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('date', selectedDateString)
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, selectedDateString, setSearchParams])

  const setDashboardDate = (date: Date) => {
    const nextDate = clampDashboardDate(startOfDay(date), minDate, today)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('date', format(nextDate, API_DATE_FORMAT))
    setSearchParams(nextParams, { replace: false })
  }

  const resetToToday = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('date')
    setSearchParams(nextParams, { replace: false })
  }

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError(null)
      try {
        const [summaryData, pendingPaymentsData] = await Promise.all([
          getAdminSummary(selectedDateString),
          getAdminPendingPayments(),
        ])
        if (!cancelled) {
          setSummary(summaryData)
          setPendingPayments(pendingPaymentsData)
        }
      } catch {
        if (!cancelled) setError('Unable to load admin dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDashboard()
    return () => {
      cancelled = true
    }
  }, [refreshKey, selectedDateString])

  const todayStatus = summary?.todayStatus
  const report = summary?.report
  const paymentIssueCount = pendingPayments?.summary.total ?? todayStatus?.pendingPayments ?? 0

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Current operations stay separate from selected-date reports."
        action={
          <RefreshDashboardButton
            loading={loading}
            onRefresh={() => setRefreshKey((value) => value + 1)}
          />
        }
      />

      {error ? (
        <Card className="border-destructive/30 bg-destructive/10 text-destructive">
          <CardContent className="flex items-center gap-2 py-4 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      {loading ? <LoadingRows rows={4} /> : null}

      {!loading && summary && (!todayStatus || !report) ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <CardContent className="flex items-center gap-2 py-4 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Dashboard API response is outdated. Restart the API server and refresh this page.
          </CardContent>
        </Card>
      ) : null}

      {!loading && summary && todayStatus && report ? (
        <>
          <section className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Today Status</h2>
                <p className="text-sm text-muted-foreground">Current operational state</p>
              </div>
              <Badge variant="secondary">Today</Badge>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
              <Card className="min-h-full">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>Capacity Overview</CardTitle>
                      <CardDescription>
                        Current capacity: {todayStatus.slots.occupied} / {todayStatus.slots.total} occupied
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{todayStatus.slots.available} available</Badge>
                      <Badge variant="outline">{todayStatus.slots.reserved} reserved</Badge>
                      <Badge variant="outline">{todayStatus.slots.occupied} occupied</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 border-b pb-5 sm:grid-cols-3">
                    <SummaryValue
                      label="Building occupancy"
                      value={formatPercent(todayStatus.slots.occupancyRate)}
                      helper={formatCountRatio(todayStatus.slots.occupied, todayStatus.slots.total, 'occupied', 'total')}
                    />
                    <SummaryValue
                      label="Available slots"
                      value={todayStatus.slots.available}
                      helper={`${todayStatus.slots.reserved} reserved`}
                    />
                    <SummaryValue
                      label="Occupied slots"
                      value={todayStatus.slots.occupied}
                      helper={`${todayStatus.slots.total} total slots`}
                    />
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Floor</TableHead>
                        <TableHead>Occupied</TableHead>
                        <TableHead className="min-w-[180px]">Floor occupancy</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {todayStatus.slots.byFloor.map((floor) => (
                        <TableRow key={String(floor.floor)}>
                          <TableCell className="font-semibold">{floor.floor}</TableCell>
                          <TableCell>
                            {floor.occupied} / {floor.total} occupied
                          </TableCell>
                          <TableCell>
                            <ProgressMeter value={floor.occupancyRate} />
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatPercent(floor.occupancyRate)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <section className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricCard
                  label="Open sessions"
                  value={todayStatus.openSessions.total}
                  helper={`${todayStatus.openSessions.active} active - ${todayStatus.openSessions.exitAuthorized} ready`}
                  icon={<Timer className="h-5 w-5" strokeWidth={1.8} />}
                />
                <MetricCard
                  label="Checkout pending"
                  value={todayStatus.openSessions.checkoutPending}
                  helper="Waiting for payment"
                  icon={<Timer className="h-5 w-5" strokeWidth={1.8} />}
                />
                <MetricCard
                  label="Pending payments"
                  value={paymentIssueCount}
                  helper={`${pendingPayments?.summary.overdue ?? 0} overdue`}
                  icon={<CreditCard className="h-5 w-5" strokeWidth={1.8} />}
                  action={
                    paymentIssueCount > 0 ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => document.getElementById('payment-monitoring')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      >
                        Review
                      </Button>
                    ) : null
                  }
                />
                <MetricCard
                  label="Payment risk"
                  value={todayStatus.paymentRisk.total}
                  helper={`${todayStatus.paymentRisk.critical} critical - ${todayStatus.paymentRisk.warning} warning`}
                  icon={<CreditCard className="h-5 w-5" strokeWidth={1.8} />}
                />
              </section>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Report for {selectedDateLabel}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Daily reconciliation data - {summary.meta.timezone}
                </p>
              </div>
              <DashboardDateFilter
                selectedDate={selectedDate}
                selectedDateLabel={selectedDateLabel}
                selectedDateIsToday={selectedDateIsToday}
                minDate={minDate}
                today={today}
                loading={loading}
                onSelectDate={setDashboardDate}
                onToday={resetToToday}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ReportMetricCard
                icon={<CircleDollarSign className="h-4 w-4" />}
                label="Revenue"
                value={formatVnd(report.revenue)}
                helper={`${formatVnd(report.revenueByMethod.bankQr)} Bank QR`}
              />
              <ReportMetricCard
                icon={<CreditCard className="h-4 w-4" />}
                label="Paid payments"
                value={report.paidPayments}
                helper={`${formatVnd(report.revenueByMethod.cash)} cash`}
              />
              <ReportMetricCard
                icon={<ParkingCircle className="h-4 w-4" />}
                label="Check-ins"
                value={report.checkIns}
                helper={`${report.reservationCheckIns} from reservations`}
              />
              <ReportMetricCard
                icon={<Timer className="h-4 w-4" />}
                label="Check-outs"
                value={report.checkOuts}
                helper={`${report.completedSessions} completed sessions`}
              />
              <ReportMetricCard
                icon={<Timer className="h-4 w-4" />}
                label="Completed sessions"
                value={report.completedSessions}
                helper="Closed during selected date"
              />
              <ReportMetricCard
                icon={<ClipboardCheck className="h-4 w-4" />}
                label="Reservation check-ins"
                value={report.reservationCheckIns}
                helper="Reservation sessions started"
              />
              <ReportMetricCard
                icon={<ClipboardCheck className="h-4 w-4" />}
                label="Expired reservations"
                value={report.expiredReservations}
                helper="Expired during selected date"
              />
              <ReportMetricCard
                icon={<CalendarDays className="h-4 w-4" />}
                label="Selected date"
                value={selectedDateLabel}
                helper={selectedDateIsToday ? 'Today report' : 'Historical report'}
              />
            </div>
          </section>

          <Card id="payment-monitoring" className="scroll-mt-6">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Payment Monitoring</CardTitle>
                  <CardDescription>Current pending payments and payment-session sync issues.</CardDescription>
                </div>
                {pendingPayments ? (
                  <div className="flex flex-wrap gap-2">
                    <RiskSummaryBadge label="Critical" value={pendingPayments.summary.critical} risk="critical" />
                    <RiskSummaryBadge label="Warning" value={pendingPayments.summary.warning} risk="warning" />
                    <RiskSummaryBadge label="Normal" value={pendingPayments.summary.normal} risk="normal" />
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!pendingPayments || pendingPayments.items.length === 0 ? (
                <EmptyState
                  title="No pending payment issues."
                  description="Payment state is clean for the current overview."
                  weight="normal"
                />
              ) : (
                <PaymentIssuesTable items={pendingPayments.items} onCopy={(sessionCode) => copySessionCode(sessionCode, toasts)} />
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

function DashboardDateFilter({
  selectedDate,
  selectedDateLabel,
  selectedDateIsToday,
  minDate,
  today,
  loading,
  onSelectDate,
  onToday,
}: {
  selectedDate: Date
  selectedDateLabel: string
  selectedDateIsToday: boolean
  minDate: Date
  today: Date
  loading: boolean
  onSelectDate: (date: Date) => void
  onToday: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      <Button
        type="button"
        variant={selectedDateIsToday ? 'secondary' : 'outline'}
        onClick={onToday}
        disabled={loading && selectedDateIsToday}
        className="h-9"
      >
        Today
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-9 justify-start gap-2 sm:min-w-[150px]">
            <CalendarDays className="h-4 w-4" />
            {selectedDateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            disabled={{ before: minDate, after: today }}
            onSelect={(date) => {
              if (!date) return
              onSelectDate(date)
              setOpen(false)
            }}
          />
          <div className="mt-3 border-t pt-3 text-xs font-medium text-muted-foreground">
            Reports are available for the last 30 days.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function RefreshDashboardButton({
  loading,
  onRefresh,
}: {
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onRefresh}
      disabled={loading}
      className="h-9"
    >
      <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
      Refresh
    </Button>
  )
}

function SummaryValue({
  label,
  value,
  helper,
}: {
  label: string
  value: string | number
  helper: string
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-black tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{helper}</div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  action,
}: {
  label: string
  value: string | number
  helper: string
  icon: ReactNode
  action?: ReactNode
}) {
  return (
    <Card className="min-h-[132px]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold text-muted-foreground">{label}</div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-black tracking-tight text-foreground">{value}</div>
            <div className="mt-1 text-xs font-medium text-muted-foreground">{helper}</div>
          </div>
          {action}
        </div>
      </CardContent>
    </Card>
  )
}

function ReportMetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode
  label: string
  value: string | number
  helper: string
}) {
  return (
    <Card className="min-h-[116px]">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-4 text-2xl font-black tracking-tight text-foreground">{value}</div>
        <div className="mt-2 text-xs font-medium text-muted-foreground">{helper}</div>
      </CardContent>
    </Card>
  )
}

function ProgressMeter({ value }: { value: number }) {
  const width = Math.min(100, Math.max(0, value))
  const toneClass =
    width >= 70
      ? 'bg-rose-500'
      : width >= 40
        ? 'bg-amber-400'
        : 'bg-emerald-500'

  return (
    <div className="h-2 rounded-full bg-muted">
      <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
    </div>
  )
}

function RiskSummaryBadge({
  label,
  value,
  risk,
}: {
  label: string
  value: number
  risk: PaymentMonitoringRisk
}) {
  return (
    <Badge variant={risk === 'critical' ? 'destructive' : risk === 'warning' ? 'outline' : 'secondary'}>
      {value} {label}
    </Badge>
  )
}

function PaymentIssuesTable({
  items,
  onCopy,
}: {
  items: AdminPendingPaymentItem[]
  onCopy: (sessionCode: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Session</TableHead>
          <TableHead>Plate</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Risk</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Action</TableHead>
          <TableHead className="text-right">Open</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.paymentId}>
            <TableCell className="font-mono text-xs font-semibold">
              {item.sessionCode ?? 'Not linked'}
            </TableCell>
            <TableCell className="font-semibold">
              {item.plateNumber ?? 'Unknown'}
            </TableCell>
            <TableCell className="text-right font-semibold">
              {formatVnd(item.amount)}
            </TableCell>
            <TableCell>
              <RiskBadge risk={item.risk} />
              <div className="mt-1 text-xs text-muted-foreground">{item.waitingLabel}</div>
            </TableCell>
            <TableCell>
              <div className="font-semibold">{item.responsibleStaff.name ?? 'Unassigned'}</div>
              <div className="text-xs text-muted-foreground">{staffSourceLabel(item.responsibleStaff.source)}</div>
            </TableCell>
            <TableCell>
              <div className="max-w-[300px] whitespace-normal text-sm text-muted-foreground">
                {item.recommendedAction}
              </div>
            </TableCell>
            <TableCell className="text-right">
              {item.sessionCode ? (
                <div className="flex justify-end gap-2">
                  <Button asChild size="xs">
                    <Link to={`/staff/gate?tab=checkout&session=${encodeURIComponent(item.sessionCode)}`}>
                      Staff
                    </Link>
                  </Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => onCopy(item.sessionCode!)}>
                    Copy
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No session</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RiskBadge({ risk }: { risk: PaymentMonitoringRisk }) {
  return (
    <Badge variant={risk === 'critical' ? 'destructive' : risk === 'warning' ? 'outline' : 'secondary'}>
      {risk.toUpperCase()}
    </Badge>
  )
}

function parseDashboardDate(value: string | null) {
  if (!value) return null
  const parsed = parseISO(value)
  if (!isValid(parsed)) return null
  return startOfDay(parsed)
}

function clampDashboardDate(date: Date, minDate: Date, maxDate: Date) {
  if (isBefore(date, minDate)) return minDate
  if (isAfter(date, maxDate)) return maxDate
  return date
}

function formatPercent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(safeValue)}%`
}

function formatCountRatio(current: number, total: number, currentLabel: string, totalLabel: string) {
  return `${current} ${currentLabel} / ${total} ${totalLabel}`
}

function formatVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} VND`
}

function staffSourceLabel(source: string) {
  const labels: Record<string, string> = {
    payment_created_by: 'Payment staff',
    checkout_started_by: 'Checkout staff',
    cash_confirmed_by: 'Cash staff',
    checkin_staff: 'Check-in staff',
    unknown: 'Unassigned',
  }
  return labels[source] ?? 'Unassigned'
}

async function copySessionCode(sessionCode: string, toasts: ReturnType<typeof useToasts>) {
  try {
    await navigator.clipboard.writeText(sessionCode)
    toasts.showSuccess('Session code copied')
  } catch {
    toasts.showError('Unable to copy session code')
  }
}
