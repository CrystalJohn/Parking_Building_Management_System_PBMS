import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, CircleDollarSign, ClipboardList } from 'lucide-react'
import api from '../../lib/api'
import { AdminPageHeader, EmptyState, LoadingRows, StatCard } from './admin-ui'

interface RevenueRow {
  vehicleType: string
  totalSessions: number
  totalRevenue: number
  totalPenalty: number
}

export default function AdminReportsFlags() {
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadReports() {
      setLoading(true)
      setError(null)
      try {
        const today = new Date().toISOString().split('T')[0]
        const { data } = await api.get<RevenueRow[]>('/reports/revenue', {
          params: { period: 'daily', date: today },
        })
        if (!cancelled) setRevenueRows(data)
      } catch {
        if (!cancelled) setError('Unable to load report data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadReports()
    return () => {
      cancelled = true
    }
  }, [])

  const summary = useMemo(() => {
    return revenueRows.reduce(
      (total, row) => ({
        sessions: total.sessions + Number(row.totalSessions || 0),
        revenue:
          total.revenue +
          Number(row.totalRevenue || 0) +
          Number(row.totalPenalty || 0),
      }),
      { sessions: 0, revenue: 0 },
    )
  }, [revenueRows])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reports & Flags"
        description="Monitoring workspace for revenue signals and operational exceptions. Incident flags remain empty until a backend flags API is available."
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <LoadingRows rows={3} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Completed sessions today"
            value={summary.sessions}
            helper="From revenue report"
            icon={<ClipboardList className="h-5 w-5" strokeWidth={1.8} />}
          />
          <StatCard
            label="Revenue today"
            value={formatVnd(summary.revenue)}
            helper="Payment and penalty totals"
            icon={<CircleDollarSign className="h-5 w-5" strokeWidth={1.8} />}
          />
          <StatCard
            label="Operational flags"
            value={0}
            helper="No flags API connected"
            icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />}
          />
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-100">
            <AlertCircle className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-950 dark:text-white">
              Exception monitoring
            </h2>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
              Payment issues, invalid reservation attempts, OCR low confidence, duplicate active plate attempts, and cancelled or expired reservation scan attempts should appear here when backend flag events are exposed.
            </p>
          </div>
        </div>

        <EmptyState
          title="No operational flags detected."
          description="No production incidents are hardcoded on this page. Connect a flags/audit endpoint later to populate this table."
        />
      </section>
    </div>
  )
}

function formatVnd(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} VND`
}
