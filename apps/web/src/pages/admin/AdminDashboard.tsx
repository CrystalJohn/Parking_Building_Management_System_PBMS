import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  ParkingCircle,
  Timer,
} from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
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
  type AdminPendingPayments,
  type AdminPendingPaymentItem,
  type AdminSummary,
  type PaymentMonitoringRisk,
} from '../../lib/admin-api'
import { useToasts } from '../../lib/use-toasts'
import { AdminPageHeader, EmptyState, LoadingRows } from './admin-ui'

export default function AdminDashboard() {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [pendingPayments, setPendingPayments] = useState<AdminPendingPayments | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toasts = useToasts()

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError(null)
      try {
        const [summaryData, pendingPaymentsData] = await Promise.all([
          getAdminSummary(),
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
  }, [])

  const paymentIssueCount = pendingPayments?.summary.total ?? summary?.payments.pending ?? 0
  const paymentRiskCount = (pendingPayments?.summary.critical ?? 0) + (pendingPayments?.summary.warning ?? 0)

  const openSessions = useMemo(() => {
    if (!summary) return 0
    return summary.sessions.active + summary.sessions.checkoutPending + summary.sessions.exitAuthorized
  }, [summary])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Building occupancy, live capacity, and payment risk with scoped denominators."
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

      {!loading && summary ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Building occupancy"
              value={formatPercent(summary.slots.occupancyRate)}
              helper={formatCountRatio(summary.slots.occupied, summary.slots.total, 'occupied', 'total')}
              icon={<ParkingCircle className="h-5 w-5" strokeWidth={1.8} />}
            />
            <MetricCard
              label="Available slots"
              value={summary.slots.available}
              helper={`${summary.slots.reserved} reserved`}
              icon={<ParkingCircle className="h-5 w-5" strokeWidth={1.8} />}
            />
            <MetricCard
              label="Open sessions"
              value={openSessions}
              helper={`${summary.sessions.checkoutPending} checkout pending`}
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
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Operations Today</CardTitle>
                    <CardDescription>{summary.meta.timezone}</CardDescription>
                  </div>
                  <Badge variant={paymentRiskCount > 0 ? 'destructive' : 'secondary'}>
                    {paymentRiskCount > 0 ? `${paymentRiskCount} risk` : 'Normal'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <OperationItem
                  icon={<CircleDollarSign className="h-4 w-4" />}
                  label="Revenue today"
                  value={formatVnd(summary.payments.revenueToday)}
                  helper={`${summary.payments.paidToday} paid payments`}
                />
                <OperationItem
                  icon={<ClipboardCheck className="h-4 w-4" />}
                  label="Active reservations"
                  value={summary.reservations.active}
                  helper={`${summary.reservations.expiredToday} expired today`}
                />
                <OperationItem
                  icon={<Timer className="h-4 w-4" />}
                  label="Checkout pending"
                  value={summary.sessions.checkoutPending}
                  helper={`${summary.sessions.exitAuthorized} ready to exit`}
                />
                <OperationItem
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Payment risk"
                  value={paymentRiskCount}
                  helper={`${pendingPayments?.summary.normal ?? 0} normal waiting`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Capacity Breakdown</CardTitle>
                    <CardDescription>
                      Building occupancy: {summary.slots.occupied} / {summary.slots.total} occupied
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{summary.slots.available} available</Badge>
                    <Badge variant="outline">{summary.slots.reserved} reserved</Badge>
                    <Badge variant="outline">{summary.slots.occupied} occupied</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
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
                    {summary.slots.byFloor.map((floor) => (
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
          </section>

          <Card id="payment-monitoring" className="scroll-mt-6">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Payment Monitoring</CardTitle>
                  <CardDescription>Pending payments only. Overview metrics come from /admin/summary.</CardDescription>
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

function OperationItem({
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
    <div className="rounded-xl border bg-muted/25 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{helper}</div>
    </div>
  )
}

function ProgressMeter({ value }: { value: number }) {
  const width = Math.min(100, Math.max(0, value))
  return (
    <div className="h-2 rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
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
