import { useCallback, useEffect, useState } from 'react'
import {
  getAdminOperationsFlags,
  getAdminSummary,
  type AdminOperationsFlags,
  type AdminSummary,
} from '../../lib/admin-api'
import {
  OperationalFlagsCard,
  DailyOperationsCard,
  CurrentParkedCard,
  getTodayTraffic,
  todayIsoDate,
} from './Dashboard'

const POLL_INTERVAL_MS = 10000

export default function Operations() {
  const [selectedDate, setSelectedDate] = useState(todayIsoDate())
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [flags, setFlags] = useState<AdminOperationsFlags | null>(null)
  const [todayTraffic, setTodayTraffic] = useState<{ checkIns: number | null, checkOuts: number | null }>({ checkIns: null, checkOuts: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOperations = useCallback(async (date: string) => {
    try {
      const [summaryData, flagData, trafficData] = await Promise.all([
        getAdminSummary(date),
        getAdminOperationsFlags(),
        getTodayTraffic(date),
      ])

      setSummary(summaryData)
      setFlags(flagData)
      setTodayTraffic(trafficData)
      setError(null)
    } catch {
      setError('Unable to load manager operations telemetry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOperations(selectedDate)
    const interval = window.setInterval(() => void loadOperations(selectedDate), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [loadOperations, selectedDate])

  const latestFlag = flags?.flags[0] ?? null
  const recentFlags = flags?.flags.slice(0, 3) ?? []

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100 lg:px-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white md:text-3xl">
            Operations
          </h1>
          <div className="flex items-center gap-3">
            <label htmlFor="operationsDate" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Date:
            </label>
            <input
              type="date"
              id="operationsDate"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={todayIsoDate()}
              min={new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().slice(0, 10)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-950 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100">
            {error}
          </div>
        ) : null}

        {!loading ? (
          <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <OperationalFlagsCard flags={flags} latestFlag={latestFlag} recentFlags={recentFlags} />
            <DailyOperationsCard summary={summary} traffic={todayTraffic} selectedDate={selectedDate} />
            <CurrentParkedCard slot={null} paymentIssue={null} />
          </section>
        ) : (
          <div className="animate-pulse space-y-5">
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="h-[300px] rounded-2xl bg-white/[0.06] border border-slate-200 dark:border-white/10" />
              <div className="h-[300px] rounded-2xl bg-white/[0.06] border border-slate-200 dark:border-white/10" />
              <div className="h-[300px] rounded-2xl bg-white/[0.06] border border-slate-200 dark:border-white/10" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
