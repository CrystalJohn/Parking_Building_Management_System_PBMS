import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Clock3, QrCode, XCircle } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cancelReservation, createReservation, getMyReservations, getMyVehicles, getReservationQuota, type DriverVehicle, type Reservation, type ReservationQuotaSnapshot } from '../../lib/driver-api'
import { ReservationCheckInQr } from '../../components/driver/ReservationCheckInQr'
import { formatDateTimeVN } from '../../lib/date-time'

const STATUS_LABELS: Record<string, { text: string; tone: string; icon: typeof CheckCircle2 }> = {
  fulfilled: { text: 'Completed', tone: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200', icon: CheckCircle2 },
  expired: { text: 'Expired', tone: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-400/20 dark:bg-slate-500/10 dark:text-slate-200', icon: Clock3 },
  cancelled: { text: 'Cancelled', tone: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200', icon: XCircle },
}

export default function Reservations() {
  const [searchParams] = useSearchParams()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [quota, setQuota] = useState<ReservationQuotaSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const paramVehicle = searchParams.get('vehicleId')

  const loadPage = async () => {
    setLoading(true)
    setError(null)
    try {
      const [vehicleData, reservationData, quotaData] = await Promise.all([getMyVehicles(), getMyReservations(), getReservationQuota()])
      setVehicles(vehicleData)
      setReservations(reservationData)
      setQuota(quotaData)
      setShowQr(false)
    } catch {
      setError('Unable to load reservation data. Retry to continue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPage() }, [])

  const activeReservation = useMemo(() => reservations.find((reservation) => reservation.status === 'active') ?? null, [reservations])
  const previousReservations = useMemo(() => reservations.filter((reservation) => reservation.status !== 'active').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [reservations])
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? vehicles.find((vehicle) => vehicle.id === paramVehicle) ?? vehicles[0] ?? null

  useEffect(() => {
    if (!selectedVehicleId && selectedVehicle?.id) setSelectedVehicleId(selectedVehicle.id)
  }, [selectedVehicle?.id, selectedVehicleId])

  const applyApiError = (err: unknown, fallback: string) => {
    const data = isAxiosError(err) ? err.response?.data : null
    if (data?.quota) setQuota(data.quota as ReservationQuotaSnapshot)
    setActionError(typeof data?.message === 'string' ? data.message : fallback)
  }

  const handleCreate = async () => {
    if (!selectedVehicle) {
      setActionError('Choose a linked vehicle before reserving a spot.')
      return
    }
    setCreating(true)
    setActionError(null)
    try {
      const response = await createReservation(selectedVehicle.id)
      setQuota(response.quota)
      await loadPage()
    } catch (err) {
      applyApiError(err, 'Unable to reserve this spot. Please retry.')
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelId) return
    setActionError(null)
    try {
      const response = await cancelReservation(cancelId)
      setQuota(response.quota)
      setCancelId(null)
      await loadPage()
    } catch (err) {
      applyApiError(err, 'Unable to cancel this reservation. Please retry.')
      setCancelId(null)
    }
  }

  return <div className="min-h-[calc(100dvh-3.5rem)] bg-slate-50/70 dark:bg-slate-950/40">
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-5 sm:px-6 sm:py-7">
      <header><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><CalendarClock className="size-4" />Driver reservations</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Parking reservation</h1><p className="mt-1 text-sm text-muted-foreground">Reserve a linked vehicle for a smoother arrival at the gate.</p></header>
      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"><span>{error}</span><Button type="button" variant="outline" className="min-h-11 border-rose-300 text-rose-700 dark:border-rose-300/40 dark:text-rose-100" onClick={() => void loadPage()}>Retry</Button></div> : null}
      {loading ? <div className="space-y-4" aria-label="Loading reservations"><div className="h-56 animate-pulse rounded-2xl bg-muted" /><div className="h-32 animate-pulse rounded-2xl bg-muted" /></div> : activeReservation ? <CurrentReservationCard reservation={activeReservation} onShowQr={() => setShowQr(true)} onCancel={() => setCancelId(activeReservation.id)} /> : <ReserveVehicleForm vehicles={vehicles} selectedVehicle={selectedVehicle} selectedVehicleId={selectedVehicleId} creating={creating} quota={quota} actionError={actionError} onSelect={setSelectedVehicleId} onCreate={() => void handleCreate()} />}
      {!loading ? <ReservationHistoryList reservations={previousReservations} /> : null}
    </div>
    {activeReservation ? <Dialog open={showQr} onOpenChange={setShowQr}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Check-in QR</DialogTitle><DialogDescription>Show this QR to gate staff for {activeReservation.licensePlate ?? activeReservation.vehicle?.plateNumber ?? 'your linked vehicle'}.</DialogDescription></DialogHeader><ReservationCheckInQr reservation={activeReservation} /></DialogContent></Dialog> : null}
    <AlertDialog open={Boolean(cancelId)} onOpenChange={(open) => { if (!open) setCancelId(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancel this reservation?</AlertDialogTitle><AlertDialogDescription>Your reserved spot will be released. You can create another reservation after cancellation.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-11">Keep reservation</AlertDialogCancel><AlertDialogAction className="min-h-11 bg-rose-600 text-white hover:bg-rose-700" onClick={() => void handleCancel()}>Cancel reservation</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}

function CurrentReservationCard({ reservation, onShowQr, onCancel }: { reservation: Reservation; onShowQr: () => void; onCancel: () => void }) {
  const plate = reservation.licensePlate ?? reservation.vehicle?.plateNumber ?? 'Vehicle unavailable'
  const slot = reservation.slot
  return <Card className="border-primary/25 shadow-sm"><CardHeader className="border-b bg-primary/5 pb-4 dark:bg-primary/10"><Badge variant="secondary" className="w-fit">Your current reservation</Badge><CardTitle className="text-xl">Your parking spot is held</CardTitle><CardDescription>Arrive before the timer ends to use this reserved spot.</CardDescription></CardHeader><CardContent className="space-y-4 p-5"><div className="space-y-2"><p className="font-mono text-lg font-bold tracking-tight">{plate} <span className="font-sans text-sm font-medium text-muted-foreground">· {reservation.vehicleType === 'car' ? 'Car' : 'Motorbike'}</span></p><p className="text-sm text-muted-foreground">{slot ? `Slot ${slot.code} · Floor ${slot.floor.name}` : 'Slot unavailable'}</p></div><div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"><Clock3 className="size-5 shrink-0" /><Countdown expiresAt={reservation.expiresAt} /></div><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" className="min-h-11 flex-1" onClick={onShowQr}><QrCode className="mr-2 size-4" />Show check-in QR</Button><Button type="button" variant="outline" className="min-h-11 border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-300/40 dark:text-rose-200 dark:hover:bg-rose-500/10" onClick={onCancel}>Cancel reservation</Button></div><details className="rounded-xl border bg-muted/20 p-3 text-sm"><summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Reservation details</summary><p className="mt-2 text-xs text-muted-foreground">Reserved at {formatDateTimeVN(reservation.createdAt)}</p></details></CardContent></Card>
}

function ReserveVehicleForm({ vehicles, selectedVehicle, selectedVehicleId, creating, quota, actionError, onSelect, onCreate }: { vehicles: DriverVehicle[]; selectedVehicle: DriverVehicle | null; selectedVehicleId: string; creating: boolean; quota: ReservationQuotaSnapshot | null; actionError: string | null; onSelect: (id: string) => void; onCreate: () => void }) {
  const [, refresh] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => refresh((value) => value + 1), 1000); return () => window.clearInterval(timer) }, [])
  const cooldownActive = Boolean(quota?.cooldownUntil && new Date(quota.cooldownUntil).getTime() > Date.now())
  const quotaReached = quota?.remaining === 0
  const disabled = creating || !selectedVehicle || cooldownActive || quotaReached
  return <Card className="shadow-sm"><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">New reservation</p><CardTitle>Reserve a parking spot</CardTitle><CardDescription>Choose a vehicle linked to your driver account.</CardDescription></CardHeader><CardContent className="space-y-4">{vehicles.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"><p className="font-semibold">No linked vehicles found</p><p className="mt-1">Reservations only support vehicles already linked to your account. Contact your parking manager to link one.</p></div> : <><fieldset><legend className="mb-2 text-sm font-semibold">Choose a vehicle</legend><div className="grid gap-3 sm:grid-cols-2">{vehicles.map((vehicle) => <button key={vehicle.id} type="button" aria-pressed={selectedVehicleId === vehicle.id} disabled={creating} onClick={() => onSelect(vehicle.id)} className={`min-h-16 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 ${selectedVehicle?.id === vehicle.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30 dark:bg-primary/10' : 'bg-background hover:border-primary/40'}`}><span className="block font-mono text-sm font-semibold">{vehicle.plateNumber}</span><span className="mt-1 block text-xs text-muted-foreground">{vehicle.vehicleType === 'car' ? 'Car' : 'Motorbike'} · {vehicle.linkedRole}</span></button>)}</div></fieldset>{actionError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">{actionError}</p> : null}<Button type="button" className="min-h-11 w-full" disabled={disabled} onClick={onCreate}>{creating ? 'Finding a parking spot...' : `Reserve a spot for ${selectedVehicle?.plateNumber ?? 'this vehicle'}`}</Button><QuotaNote quota={quota} /></>}</CardContent></Card>
}

function QuotaNote({ quota }: { quota: ReservationQuotaSnapshot | null }) {
  if (!quota) return <p className="text-sm text-muted-foreground">Checking reservation availability...</p>
  const cooldownUntil = quota.cooldownUntil ? new Date(quota.cooldownUntil) : null
  if (cooldownUntil && cooldownUntil.getTime() > Date.now()) return <p className="text-sm text-amber-700 dark:text-amber-200">You cancelled a reservation. Try again in {formatCountdown(cooldownUntil)}.</p>
  if (quota.remaining <= 0) return <p className="text-sm text-rose-700 dark:text-rose-200">Reservation limit reached. You can try again at {formatClock(quota.windowResetAt)}.</p>
  return <p className="text-sm text-muted-foreground">You can create {quota.remaining} more reservation{quota.remaining === 1 ? '' : 's'} before {formatClock(quota.windowResetAt)}.</p>
}

function ReservationHistoryList({ reservations }: { reservations: Reservation[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? reservations : reservations.slice(0, 3)
  if (reservations.length === 0) return <Card className="border-dashed shadow-none"><CardContent className="p-5 text-center text-sm text-muted-foreground">No previous reservations yet.</CardContent></Card>
  return <section aria-labelledby="previous-reservations" className="space-y-3"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">History</p><h2 id="previous-reservations" className="text-lg font-semibold">Previous reservations</h2></div>{reservations.length > 3 ? <Button type="button" variant="ghost" className="min-h-11 px-2" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show less' : 'View full history'}{expanded ? <ChevronUp className="ml-1 size-4" /> : <ChevronDown className="ml-1 size-4" />}</Button> : null}</div><div className="space-y-2">{visible.map((reservation) => <PreviousReservationRow key={reservation.id} reservation={reservation} />)}</div></section>
}

function PreviousReservationRow({ reservation }: { reservation: Reservation }) { const status = STATUS_LABELS[reservation.status] ?? STATUS_LABELS.expired; const Icon = status.icon; const plate = reservation.licensePlate ?? reservation.vehicle?.plateNumber ?? 'Vehicle unavailable'; return <Card className="shadow-none"><CardContent className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-mono text-sm font-semibold">{plate}</p><p className="mt-1 text-xs text-muted-foreground">{reservation.vehicleType === 'car' ? 'Car' : 'Motorbike'} · {reservation.slot ? `Slot ${reservation.slot.code} · ${reservation.slot.floor.name}` : 'Slot unavailable'}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTimeVN(reservation.createdAt)}</p></div><Badge variant="outline" className={`shrink-0 ${status.tone}`}><Icon className="mr-1 size-3.5" />{status.text}</Badge></CardContent></Card> }

function Countdown({ expiresAt }: { expiresAt: string }) { const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt)); useEffect(() => { const timer = window.setInterval(() => setRemaining(calcRemaining(expiresAt)), 1000); return () => window.clearInterval(timer) }, [expiresAt]); if (remaining <= 0) return <span className="text-sm font-semibold">Reservation expired</span>; return <span className="text-sm font-semibold">Arrive within <span className="font-mono tabular-nums">{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</span></span> }
function calcRemaining(expiresAt: string) { return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) }
function formatClock(value: string) { return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatCountdown(value: Date) { const remaining = Math.max(0, Math.ceil((value.getTime() - Date.now()) / 1000)); return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}` }
