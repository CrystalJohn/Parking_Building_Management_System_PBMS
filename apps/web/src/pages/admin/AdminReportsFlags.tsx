import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react'
import {
  getAdminOperationsFlags,
  type AdminFlagSeverity,
  type AdminOperationsFlags,
} from '../../lib/admin-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { AdminPageHeader, EmptyState, LoadingRows, StatCard, StatusBadge } from './admin-ui'

export default function AdminReportsFlags() {
  const [data, setData] = useState<AdminOperationsFlags | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadFlags() {
      setLoading(true)
      setError(null)
      try {
        const result = await getAdminOperationsFlags()
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setError('Unable to load operational flags')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadFlags()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reports & Flags"
        description="Derived operational flags from current PBMS database state. Phase 1 does not include audit/event-log incidents."
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? <LoadingRows rows={3} /> : null}

      {!loading && data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard
              label="Total flags"
              value={data.summary.totalFlags}
              helper="Latest 50 derived flags"
              icon={<ShieldAlert className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Critical"
              value={data.summary.critical}
              helper="Needs immediate review"
              icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Warning"
              value={data.summary.warning}
              helper="Operational attention"
              icon={<Info className="h-5 w-5" strokeWidth={1.8} />}
            />
            <StatCard
              label="Info"
              value={data.summary.info}
              helper="Low-risk telemetry"
              icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />}
            />
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <h2 className="text-base font-black text-slate-950 dark:text-white">
                Operational flags
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                Thresholds: active session over {data.thresholds.longActiveSessionHours}h, checkout pending over {data.thresholds.checkoutPendingMinutes}m, exit authorized over {data.thresholds.exitAuthorizedMinutes}m, Bank QR pending over {data.thresholds.pendingBankQrMinutes}m.
              </p>
            </div>

            {data.flags.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No operational flags detected."
                  description="No production incidents are hardcoded. This list only shows flags derived from current database state."
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {data.flags.map((flag, index) => (
                  <article key={`${flag.type}-${flag.sessionCode ?? flag.paymentId ?? index}`} className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={flag.severity} />
                          <span className="text-xs font-black uppercase text-slate-400">
                            {formatFlagType(flag.type)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">
                          {flag.message}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {flag.sessionCode ? <span>Session {flag.sessionCode}</span> : null}
                          {flag.reservationCode ? <span>Reservation {flag.reservationCode}</span> : null}
                          {flag.plateNumber ? <span>Plate {flag.plateNumber}</span> : null}
                          {flag.paymentId ? <span>Payment {shortCode(flag.paymentId)}</span> : null}
                        </div>
                      </div>
                      <div className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-right">
                        <p>{flag.ageMinutes} minutes old</p>
                        <p className="mt-1">{formatDateTimeVN(flag.createdAt)}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: AdminFlagSeverity }) {
  const tone = severity === 'critical' ? 'red' : severity === 'warning' ? 'amber' : 'blue'
  return <StatusBadge label={severity.toUpperCase()} tone={tone} />
}

function formatFlagType(type: string) {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function shortCode(value: string) {
  if (value.length <= 12) return value
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}
