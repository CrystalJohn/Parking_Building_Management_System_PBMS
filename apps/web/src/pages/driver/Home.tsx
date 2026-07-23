import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ActiveReservationCard } from '@/components/driver/ActiveReservationCard'
import { AvailabilitySummary } from '@/components/driver/AvailabilitySummary'
import { FloorAvailabilityCard } from '@/components/driver/FloorAvailabilityCard'
import { cancelReservation, getAvailability, getMyReservations, getPricing, type AvailabilityItem, type PricingInfo, type Reservation } from '@/lib/driver-api'

const ACTIVE_REFRESH_MS = 30_000

export default function DriverHome() {
  const [availability, setAvailability] = useState<AvailabilityItem[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [pricing, setPricing] = useState<PricingInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reservationError, setReservationError] = useState<string | null>(null)

  const loadAvailability = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const [availabilityResult, pricingResult] = await Promise.allSettled([getAvailability(), getPricing()])
      if (availabilityResult.status === 'rejected') throw availabilityResult.reason
      setAvailability(availabilityResult.value)
      if (pricingResult.status === 'fulfilled') setPricing(pricingResult.value)
      setError(null)
    } catch {
      setError('Unable to load parking availability.')
    } finally {
      setRefreshing(false)
    }
  }, [])

  const loadReservations = useCallback(async () => {
    try {
      setReservations(await getMyReservations())
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

  const activeReservations = useMemo(() => reservations.filter((reservation) => reservation.status === 'active'), [reservations])
  const groupedFloors = useMemo(() => {
    const grouped = new Map<string, AvailabilityItem[]>()
    for (const item of availability) grouped.set(item.floorName, [...(grouped.get(item.floorName) ?? []), item])
    return [...grouped.entries()]
  }, [availability])

  const handleCancel = async (id: string) => {
    if (!window.confirm('Cancel this active reservation? The reserved slot will be released.')) return
    try {
      await cancelReservation(id)
      await loadReservations()
    } catch {
      setReservationError('Unable to cancel this reservation. Please retry.')
    }
  }

  return <div className="min-h-[calc(100dvh-3.5rem)] bg-slate-50/70 dark:bg-slate-950/40">
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 sm:py-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Sparkles className="size-4" />Driver home</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Find your next spot</h1><p className="mt-1 text-sm text-muted-foreground">Live parking availability and reservation check-in in one place.</p></div>
        <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => void loadAvailability(true)} disabled={refreshing}><RefreshCw className={`mr-2 size-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh availability</Button>
      </header>

      {reservationError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"><span>{reservationError}</span><Button type="button" variant="outline" className="min-h-11 border-rose-300 text-rose-700 dark:border-rose-300/40 dark:text-rose-100" onClick={() => void loadReservations()}>Retry reservations</Button></div> : null}
      {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">{error} <button type="button" className="ml-2 min-h-11 font-semibold underline underline-offset-4" onClick={() => void loadAvailability(true)}>Retry</button></div> : null}

      {loading ? <HomeSkeleton /> : <>
        {activeReservations.length > 0 ? <section aria-labelledby="active-reservations" className="space-y-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Priority</p><h2 id="active-reservations" className="text-lg font-semibold">Your active reservations</h2></div>{activeReservations.map((reservation) => <ActiveReservationCard key={reservation.id} reservation={reservation} onCancel={handleCancel} />)}</section> : <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">No active reservation</p><h2 className="mt-1 text-xl font-semibold">Choose a spot when you are ready</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Browse live floor availability, then reserve a linked vehicle in one step.</p><Button asChild className="mt-4 min-h-11"><Link to="/driver/reservations">Reserve a spot <ArrowRight className="ml-2 size-4" /></Link></Button></section>}

        <section aria-labelledby="availability" className="space-y-3"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Live now</p><h2 id="availability" className="text-lg font-semibold">Availability</h2></div><span className="text-xs text-muted-foreground">Updates every 30 seconds</span></div><div className="grid gap-3 sm:grid-cols-2"><AvailabilitySummary items={availability.filter((item) => item.vehicleType === 'car')} vehicleType="car" rate={pricing.find((item) => item.vehicleType === 'car')?.hourlyRate ?? 20_000} /><AvailabilitySummary items={availability.filter((item) => item.vehicleType === 'motorbike')} vehicleType="motorbike" rate={pricing.find((item) => item.vehicleType === 'motorbike')?.hourlyRate ?? 10_000} /></div><div className="grid gap-3 md:grid-cols-2">{groupedFloors.map(([floorName, items]) => <FloorAvailabilityCard key={floorName} floorName={floorName} items={items} />)}</div>{availability.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No availability data is available right now.</p> : null}</section>

        <section className="rounded-2xl border bg-background p-4 sm:p-5"><details><summary className="cursor-pointer list-none text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Pricing details</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{(['car', 'motorbike'] as const).map((type) => { const item = pricing.find((entry) => entry.vehicleType === type); return <div key={type} className="rounded-xl bg-muted/30 p-3 text-sm"><p className="font-semibold">{type === 'car' ? 'Car' : 'Motorbike'}</p><p className="mt-1 text-muted-foreground">{new Intl.NumberFormat('vi-VN').format(item?.hourlyRate ?? (type === 'car' ? 20_000 : 10_000))} VND / hour</p><p className="text-xs text-muted-foreground">Overtime: {new Intl.NumberFormat('vi-VN').format(item?.overtimePenalty ?? 50_000)} VND</p></div> })}</div></details></section>
      </>}
    </div>
  </div>
}

function HomeSkeleton() { return <div className="space-y-4" aria-label="Loading driver home"><div className="h-28 animate-pulse rounded-2xl bg-muted" /><div className="grid gap-3 sm:grid-cols-2"><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /></div><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div> }
