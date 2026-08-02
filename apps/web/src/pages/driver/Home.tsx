import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Car, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AvailabilitySummary } from '@/components/driver/AvailabilitySummary'
import { getAvailability, getMyReservations, getMyVehicles, type AvailabilityItem, type DriverVehicle, type Reservation } from '@/lib/driver-api'

const ACTIVE_REFRESH_MS = 30_000

export default function DriverHome() {
  const [availability, setAvailability] = useState<AvailabilityItem[]>([])
  const [, setReservations] = useState<Reservation[]>([])
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reservationError, setReservationError] = useState<string | null>(null)

  const loadAvailability = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const availabilityData = await getAvailability()
      setAvailability(availabilityData)
      setError(null)
    } catch {
      setError('Unable to load parking availability.')
    } finally {
      setRefreshing(false)
    }
  }, [])

  const loadReservations = useCallback(async () => {
    try {
      const [resData, vehData] = await Promise.all([getMyReservations(), getMyVehicles()])
      setReservations(resData)
      setVehicles(vehData)
      setReservationError(null)
    } catch {
      setReservationError('Unable to load your reservations. Retry to see your latest booking.')
    }
  }, [])

  const loadHome = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadAvailability(), loadReservations()])
    setLoading(false)
  }, [loadAvailability, loadReservations])

  useEffect(() => { void loadHome() }, [loadHome])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadAvailability()
    }
    const timer = window.setInterval(refreshWhenVisible, ACTIVE_REFRESH_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshWhenVisible) }
  }, [loadAvailability])



  return <div className="min-h-[calc(100dvh-3.5rem)] bg-slate-50/70 dark:bg-slate-950/40">
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 sm:py-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Sparkles className="size-4" />Driver home</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Find your next spot</h1><p className="mt-1 text-sm text-muted-foreground">Live parking availability and reservation check-in in one place.</p></div>
        <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => void loadAvailability(true)} disabled={refreshing}><RefreshCw className={`mr-2 size-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh availability</Button>
      </header>

      {reservationError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"><span>{reservationError}</span><Button type="button" variant="outline" className="min-h-11 border-rose-300 text-rose-700 dark:border-rose-300/40 dark:text-rose-100" onClick={() => void loadReservations()}>Retry reservations</Button></div> : null}
      {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">{error} <button type="button" className="ml-2 min-h-11 font-semibold underline underline-offset-4" onClick={() => void loadAvailability(true)}>Retry</button></div> : null}

      {!loading && vehicles.length === 0 ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 text-amber-900 dark:text-amber-100 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Car className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">New Account Notice: Link Your Vehicle</h3>
              <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/90 max-w-xl">
                You haven't linked a vehicle yet. Submit your vehicle plate & Cà vẹt document to unlock 20% OFF spot reservations.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="min-h-10 shrink-0 font-semibold shadow-sm w-full sm:w-auto">
            <Link to="/driver/reservations?action=register">
              <Plus className="mr-1.5 size-4" />
              Register Vehicle Now
            </Link>
          </Button>
        </div>
      ) : null}

      {loading ? <HomeSkeleton /> : <>
        <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 shadow-sm sm:p-8">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Live Real-time Building Capacity &amp; Availability</h2>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                View real-time open parking spots at PBMS Tower. Reserve in advance to lock your 20% discounted spot.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Button asChild size="lg" className="rounded-xl shadow-md font-bold text-xs">
                <Link to="/driver/reservations">Reserve Spot Now <ArrowRight className="ml-2 size-4" /></Link>
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="availability" className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Live now</p>
              <h2 id="availability" className="text-lg font-semibold">Availability</h2>
            </div>
            <span className="text-xs text-muted-foreground">Updates every 30 seconds</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AvailabilitySummary items={availability.filter((item) => item.vehicleType === 'car')} vehicleType="car" />
            <AvailabilitySummary items={availability.filter((item) => item.vehicleType === 'motorbike')} vehicleType="motorbike" />
          </div>
          {availability.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No availability data is available right now.</p> : null}
        </section>

      </>}
    </div>
  </div>
}

function HomeSkeleton() { return <div className="space-y-4" aria-label="Loading driver home"><div className="h-28 animate-pulse rounded-2xl bg-muted" /><div className="grid gap-3 sm:grid-cols-2"><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /></div><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div> }
