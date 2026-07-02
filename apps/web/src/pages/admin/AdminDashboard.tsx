import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  ParkingCircle,
  Percent,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react'
import {
  getAdminPendingPayments,
  getAdminSummary,
  type AdminPendingPayments,
  type PaymentMonitoringRisk,
  type AdminSummary,
} from '../../lib/admin-api'
import { AdminPageHeader, EmptyState, LoadingRows, StatCard, StatusBadge } from './admin-ui'
import { useToasts } from '../../lib/use-toasts'

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
        if (!cancelled) setError('Unable to load admin telemetry')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDashboard()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Dashboard"
        description="Operational telemetry from backend source-of-truth metrics for users, slots, sessions, reservations, and payments."
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? <LoadingRows rows={4} /> : null}

      {!loading && summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total users"
              value={summary.users.total}
              helper={`${summary.users.inactive} inactive`}
              icon={<Users className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Active users"
              value={summary.users.active}
              helper="Accounts allowed to sign in"
              icon={<UserCheck className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Occupied slots"
              value={summary.slots.occupied}
              helper={`${summary.slots.available} available, ${summary.slots.reserved} reserved`}
              icon={<ParkingCircle className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Occupancy rate"
              value={`${summary.slots.occupancyRate}%`}
              helper="Occupied slots over total slots"
              icon={<Percent className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Active sessions"
              value={summary.sessions.active}
              helper={`${summary.sessions.checkoutPending} checkout pending`}
              icon={<Timer className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Active reservations"
              value={summary.reservations.active}
              helper={`${summary.reservations.expiredToday} expired today`}
              icon={<ClipboardCheck className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Today revenue"
              value={formatVnd(summary.payments.revenueToday)}
              helper={`${formatVnd(summary.payments.byMethod.bankQr)} via Bank QR`}
              icon={<CircleDollarSign className="h-5 w-5" strokeWidth={1.8} />}
            />
            <button
              type="button"
              onClick={() => document.getElementById('payment-monitoring')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="text-left transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
            >
              <StatCard
                label="Pending payments"
                value={pendingPayments?.summary.total ?? summary.payments.pending}
                helper={`${pendingPayments?.summary.overdue ?? 0} overdue, ${pendingPayments?.summary.normal ?? 0} waiting`}
                icon={<CreditCard className="h-5 w-5" strokeWidth={1.8} />}
              />
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white">
                  Slot occupancy
                </h2>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Current slot status by floor and zone.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={`${summary.slots.available} available`} tone="green" />
                <StatusBadge label={`${summary.slots.reserved} reserved`} tone="amber" />
                <StatusBadge label={`${summary.slots.occupied} occupied`} tone="red" />
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-slate-200 text-xs font-black uppercase text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <tr>
                    <th className="py-3 text-left">Floor</th>
                    <th className="py-3 text-right">Total</th>
                    <th className="py-3 text-right">Available</th>
                    <th className="py-3 text-right">Reserved</th>
                    <th className="py-3 text-right">Occupied</th>
                    <th className="py-3 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {summary.slots.byFloor.map((floor) => (
                    <tr key={String(floor.floor)}>
                      <td className="py-3 font-black text-slate-900 dark:text-white">{floor.floor}</td>
                      <td className="py-3 text-right font-semibold text-slate-600 dark:text-slate-300">{floor.total}</td>
                      <td className="py-3 text-right font-semibold text-emerald-700 dark:text-emerald-200">{floor.available}</td>
                      <td className="py-3 text-right font-semibold text-amber-700 dark:text-amber-200">{floor.reserved}</td>
                      <td className="py-3 text-right font-semibold text-rose-700 dark:text-rose-200">{floor.occupied}</td>
                      <td className="py-3 text-right font-black text-slate-900 dark:text-white">{floor.occupancyRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            id="payment-monitoring"
            className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
          >
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-black text-slate-950 dark:text-white">
                  Payment monitoring
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                  Read-only operational view for pending payments and payment-session sync issues.
                </p>
              </div>
              {pendingPayments ? (
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={`${pendingPayments.summary.critical} critical`} tone="red" />
                  <StatusBadge label={`${pendingPayments.summary.warning} warning`} tone="amber" />
                  <StatusBadge label={`${pendingPayments.summary.normal} normal`} tone="green" />
                </div>
              ) : null}
            </div>

            {!pendingPayments || pendingPayments.items.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No pending payment issues detected."
                  description="The backend did not return any pending payments or payment-session inconsistencies."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-black uppercase text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
                    <tr>
                      <th className="px-5 py-4 text-left">Session Code</th>
                      <th className="px-5 py-4 text-left">Plate</th>
                      <th className="px-5 py-4 text-right">Amount</th>
                      <th className="px-5 py-4 text-left">Staff Owner</th>
                      <th className="px-5 py-4 text-left">Location</th>
                      <th className="px-5 py-4 text-left">Risk / Waiting</th>
                      <th className="px-5 py-4 text-left">Recommended Action</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                    {pendingPayments.items.map((item) => (
                      <tr key={item.paymentId}>
                        <td className="px-5 py-4 font-mono text-xs font-black text-slate-900 dark:text-white">
                          {item.sessionCode ?? 'Not linked'}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-600 dark:text-slate-300">
                          {item.plateNumber ?? 'Unknown'}
                        </td>
                        <td className="px-5 py-4 text-right font-black text-slate-900 dark:text-white">
                          {formatVnd(item.amount)}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-900 dark:text-white">
                            {item.responsibleStaff.name ?? 'Unassigned'}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {item.responsibleStaff.phone ?? 'No staff owner'}
                          </p>
                          <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10">
                            {staffSourceLabel(item.responsibleStaff.source)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-900 dark:text-white">
                            {item.slotCode ?? 'Unknown slot'}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {item.locationLabel}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <RiskBadge risk={item.risk} />
                          <p className="mt-2 text-xs font-black text-slate-700 dark:text-slate-200">
                            {item.waitingLabel}
                          </p>
                          <p className="mt-1 max-w-[220px] text-xs font-medium leading-5 text-slate-400">
                            {item.reason}
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="max-w-sm font-semibold leading-5 text-slate-600 dark:text-slate-300">
                            {item.recommendedAction}
                          </p>
                          <p className="mt-2 text-xs font-semibold text-slate-400">
                            {readablePaymentMethod(item.method)} · {item.provider?.toUpperCase() ?? 'No provider'} · {item.sessionStatus ?? 'Unknown status'}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-right align-top">
                          <div className="flex flex-col items-end gap-2">
                            {item.sessionCode ? (
                              <>
                                <Link
                                  to={`/staff/gate?tab=checkout&session=${encodeURIComponent(item.sessionCode)}`}
                                  className="rounded-xl bg-primary-600 px-3 py-2 text-xs font-black text-white transition hover:bg-primary-700"
                                >
                                  Open Staff Context
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => void copySessionCode(item.sessionCode!, toasts)}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-primary-200 hover:text-primary-700 dark:border-white/10 dark:text-slate-200 dark:hover:text-white"
                                >
                                  Copy Session Code
                                </button>
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">No session code</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-slate-200 px-5 py-3 text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
              Issues are cleared automatically when the underlying payment or session status changes.
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

function formatVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} VND`
}

function readablePaymentMethod(method: 'cash' | 'bank_qr') {
  return method === 'bank_qr' ? 'Bank QR' : 'Cash'
}

function RiskBadge({ risk }: { risk: PaymentMonitoringRisk }) {
  const tone = risk === 'critical' ? 'red' : risk === 'warning' ? 'amber' : 'green'
  return <StatusBadge label={risk.toUpperCase()} tone={tone} />
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
