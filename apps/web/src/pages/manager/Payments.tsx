import { useCallback, useEffect, useState } from 'react'
import {
  getAdminPendingPayments,
  getAdminSummary,
  type AdminPendingPayments,
  type AdminSummary,
} from '../../lib/admin-api'
import {
  PaymentMonitoringCard,
  RevenueSummaryCard,
} from './Dashboard'

const POLL_INTERVAL_MS = 10000

export default function Payments() {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [pendingPayments, setPendingPayments] = useState<AdminPendingPayments | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPayments = useCallback(async () => {
    try {
      const [summaryData, paymentData] = await Promise.all([
        getAdminSummary(),
        getAdminPendingPayments(),
      ])

      setSummary(summaryData)
      setPendingPayments(paymentData)
      setError(null)
    } catch {
      setError('Unable to load manager payments telemetry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPayments()
    const interval = window.setInterval(() => void loadPayments(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loadPayments])

  const recentPaymentIssues = pendingPayments?.items.slice(0, 5) ?? []

  return (
    <>
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Payments & Revenue
        </h1>
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100">
            {error}
          </div>
        ) : null}

        {!loading ? (
          <section className="grid gap-5 md:grid-cols-2">
            <PaymentMonitoringCard pendingPayments={pendingPayments} recentPaymentIssues={recentPaymentIssues} />
            <RevenueSummaryCard summary={summary} />
          </section>
        ) : (
          <div className="animate-pulse space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="h-[300px] rounded-2xl bg-white/[0.06] border border-border" />
              <div className="h-[300px] rounded-2xl bg-white/[0.06] border border-border" />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
