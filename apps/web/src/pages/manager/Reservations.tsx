import { useCallback, useEffect, useState } from 'react'
import {
  getAdminSummary,
  type AdminSummary,
} from '../../lib/admin-api'
import {
  ReservationOverviewCard,
} from './Dashboard'

const POLL_INTERVAL_MS = 10000

export default function Reservations() {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadReservations = useCallback(async () => {
    try {
      const summaryData = await getAdminSummary()
      setSummary(summaryData)
      setError(null)
    } catch {
      setError('Unable to load manager reservations telemetry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReservations()
    const interval = window.setInterval(() => void loadReservations(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loadReservations])

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 lg:px-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white md:text-3xl">
          Reservations
        </h1>
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100">
            {error}
          </div>
        ) : null}

        {!loading ? (
          <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <ReservationOverviewCard summary={summary} />
          </section>
        ) : (
          <div className="animate-pulse space-y-5">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <div className="h-[200px] rounded-2xl bg-white/[0.06] border border-slate-200 dark:border-white/10" />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
