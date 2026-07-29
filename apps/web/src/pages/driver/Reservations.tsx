import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  CalendarClock,
  Camera,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  FileText,
  Plus,
  QrCode,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog as BaseDialog,
  DialogPopup as BaseDialogPopup,
  DialogHeader as BaseDialogHeader,
  DialogTitle as BaseDialogTitle,
  DialogDescription as BaseDialogDescription,
} from '@/components/animate-ui/components/base/dialog'
import {
  cancelReservation,
  createReservation,
  createVehicleRegistrationRequest,
  getMyReservations,
  getMyVehicleRegistrationRequests,
  getMyVehicles,
  getReservationQuota,
  type DriverVehicle,
  type Reservation,
  type ReservationQuotaSnapshot,
  type VehicleRegistrationRequest,
  type VehicleType,
} from '../../lib/driver-api'
import { ReservationCheckInQr } from '../../components/driver/ReservationCheckInQr'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatPlateForDisplay, formatVehicleType } from '../../lib/plate-format'

const STATUS_LABELS: Record<string, { text: string; tone: string; icon: typeof CheckCircle2 }> = {
  fulfilled: {
    text: 'Completed',
    tone: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200',
    icon: CheckCircle2,
  },
  expired: {
    text: 'Expired',
    tone: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-400/20 dark:bg-slate-500/10 dark:text-slate-200',
    icon: Clock3,
  },
  cancelled: {
    text: 'Cancelled',
    tone: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200',
    icon: XCircle,
  },
}

export default function Reservations() {
  const [searchParams] = useSearchParams()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [quota, setQuota] = useState<ReservationQuotaSnapshot | null>(null)
  const [registrationRequests, setRegistrationRequests] = useState<VehicleRegistrationRequest[]>([])
  const [showNewAccountPrompt, setShowNewAccountPrompt] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [showVehicleRequest, setShowVehicleRequest] = useState(false)
  const [requestPlate, setRequestPlate] = useState('')
  const [requestType, setRequestType] = useState<VehicleType>('car')
  const [requestEvidence, setRequestEvidence] = useState<File | null>(null)
  const [requestVehiclePhoto, setRequestVehiclePhoto] = useState<File | null>(null)
  const [requestPlatePhoto, setRequestPlatePhoto] = useState<File | null>(null)
  const [requestingVehicle, setRequestingVehicle] = useState(false)
  const paramVehicle = searchParams.get('vehicleId')
  const actionParam = searchParams.get('action')
  const mountRef = useRef(false)

  const loadPage = async () => {
    setLoading(true)
    setError(null)
    try {
      const [vehicleData, reservationData, quotaData, requestData] = await Promise.all([
        getMyVehicles(),
        getMyReservations(),
        getReservationQuota(),
        getMyVehicleRegistrationRequests(),
      ])
      setVehicles(vehicleData)
      setReservations(reservationData)
      setQuota(quotaData)
      setRegistrationRequests(requestData)
      setShowQr(false)
      if (vehicleData.length === 0 && requestData.length === 0) {
        setShowNewAccountPrompt(true)
      }
    } catch {
      setError('Unable to load reservation data. Retry to continue.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (actionParam === 'register') {
      setShowVehicleRequest(true)
    }
  }, [actionParam])

  useEffect(() => {
    if (!mountRef.current) {
      mountRef.current = true
      void loadPage()
    }
  }, [])

  const activeReservation = useMemo(
    () => reservations.find((reservation) => reservation.status === 'active') ?? null,
    [reservations]
  )
  const previousReservations = useMemo(
    () =>
      reservations
        .filter((reservation) => reservation.status !== 'active')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reservations]
  )
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ??
    vehicles.find((vehicle) => vehicle.id === paramVehicle) ??
    vehicles[0] ??
    null

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

  const handleVehicleRequest = async () => {
    const plate = requestPlate.trim().toUpperCase().replace(/\s+/g, '')
    if (!plate || !requestEvidence || !requestVehiclePhoto || !requestPlatePhoto) return
    setRequestingVehicle(true)
    setActionError(null)
    try {
      const request = await createVehicleRegistrationRequest(plate, requestType, requestEvidence)
      setRegistrationRequests((current) => [request, ...current])
      setRequestPlate('')
      setRequestEvidence(null)
      setRequestVehiclePhoto(null)
      setRequestPlatePhoto(null)
      setShowVehicleRequest(false)
    } catch (err) {
      applyApiError(err, 'Unable to submit the vehicle request. Please retry.')
    } finally {
      setRequestingVehicle(false)
    }
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-slate-50/70 dark:bg-slate-950/40">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-5 sm:px-6 sm:py-7">
        <header>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <CalendarClock className="size-4" />
            Driver Reservations
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Parking Reservation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reserve a parking spot for your vehicle in advance for seamless arrival at the gate.
          </p>
        </header>

        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
            <span>{error}</span>
            <Button type="button" variant="outline" className="min-h-11 border-rose-300 text-rose-700 dark:border-rose-300/40 dark:text-rose-100" onClick={() => void loadPage()}>
              Retry
            </Button>
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-6 md:grid-cols-12" aria-label="Loading reservations">
            <div className="h-72 animate-pulse rounded-2xl bg-muted md:col-span-7" />
            <div className="h-72 animate-pulse rounded-2xl bg-muted md:col-span-5" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-12">
            {/* Left Column: Primary Action (Booking Form or Active Reservation) */}
            <div className="space-y-6 md:col-span-7">
              {activeReservation ? (
                <CurrentReservationCard
                  reservation={activeReservation}
                  onShowQr={() => setShowQr(true)}
                  onCancel={() => setCancelId(activeReservation.id)}
                />
              ) : (
                <ReserveVehicleForm
                  vehicles={vehicles}
                  selectedVehicle={selectedVehicle}
                  creating={creating}
                  quota={quota}
                  actionError={actionError}
                  requests={registrationRequests}
                  onSelect={setSelectedVehicleId}
                  onCreate={() => void handleCreate()}
                  onRequestVehicle={() => setShowVehicleRequest(true)}
                />
              )}
            </div>

            {/* Right Column: Guidance & History */}
            <div className="space-y-6 md:col-span-5">
              {/* Gate Entry Guidance Card */}
              <Card className="border-primary/20 bg-primary/5 shadow-none dark:bg-primary/10">
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                    <ShieldCheck className="size-4" />
                    How Gate Check-in Works
                  </div>
                  <ul className="space-y-2.5 text-xs text-muted-foreground">
                    <li className="flex items-start gap-2.5">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">1</span>
                      <span>Camera OCR automatically scans your plate at the gate entrance.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">2</span>
                      <span>Upon recognition, the gate opens and guides you to your reserved slot.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">3</span>
                      <span>Or present your <strong>Check-in QR</strong> to staff if OCR cannot read the plate.</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Reservation History Section */}
              <ReservationHistoryList reservations={previousReservations} />
            </div>
          </div>
        )}
      </div>

      {/* QR Dialog */}
      {activeReservation ? (
        <BaseDialog open={showQr} onOpenChange={setShowQr}>
          <BaseDialogPopup from="top" showCloseButton={false} className="max-w-md border-0 bg-transparent p-0 shadow-none sm:max-w-lg">
            <ReservationCheckInQr reservation={activeReservation} onClose={() => setShowQr(false)} />
          </BaseDialogPopup>
        </BaseDialog>
      ) : null}

      {/* Request Vehicle Link Dialog */}
      <BaseDialog open={showVehicleRequest} onOpenChange={setShowVehicleRequest}>
        <BaseDialogPopup from="top" className="sm:max-w-lg">
          <BaseDialogHeader>
            <BaseDialogTitle>Request a Vehicle Link</BaseDialogTitle>
            <BaseDialogDescription>
              Submit your vehicle details and 3 verification photos for Manager review and approval.
            </BaseDialogDescription>
          </BaseDialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-foreground" htmlFor="request-plate">
                Plate number<span className="text-destructive"> *</span>
              </label>
              <input
                id="request-plate"
                value={requestPlate}
                onChange={(event) => setRequestPlate(event.target.value.toUpperCase())}
                placeholder="59A-123.45"
                autoComplete="off"
                className="mt-1.5 min-h-11 w-full rounded-lg border bg-background px-3 font-mono text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-foreground" htmlFor="request-type">
                Vehicle type
              </label>
              <select
                id="request-type"
                value={requestType}
                onChange={(event) => setRequestType(event.target.value as VehicleType)}
                className="mt-1.5 min-h-11 w-full rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="car">Car</option>
                <option value="motorbike">Motorbike</option>
              </select>
            </div>

            {/* 3 Verification Document Inputs */}
            <div className="space-y-3.5 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Verification Documents (3 Required Photos)
                </p>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {[requestEvidence, requestVehiclePhoto, requestPlatePhoto].filter(Boolean).length} / 3 Uploaded
                </span>
              </div>

              {/* 1. Cà vẹt xe */}
              <div className="rounded-lg border bg-background p-3 space-y-1.5">
                <label className="flex items-center justify-between text-xs font-semibold text-foreground cursor-pointer" htmlFor="request-evidence">
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-4 text-primary" />
                    1. Vehicle Registration Certificate (Cà vẹt xe)<span className="text-destructive"> *</span>
                  </span>
                  {requestEvidence ? <CheckCircle2 className="size-4 text-emerald-500" /> : <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">Required</span>}
                </label>
                <input
                  id="request-evidence"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setRequestEvidence(event.target.files?.[0] || null)}
                  className="w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                />
              </div>

              {/* 2. Ảnh tổng thể xe */}
              <div className="rounded-lg border bg-background p-3 space-y-1.5">
                <label className="flex items-center justify-between text-xs font-semibold text-foreground cursor-pointer" htmlFor="request-vehicle-photo">
                  <span className="flex items-center gap-1.5">
                    <Car className="size-4 text-primary" />
                    2. Overall Vehicle Photo (Ảnh tổng thể xe)<span className="text-destructive"> *</span>
                  </span>
                  {requestVehiclePhoto ? <CheckCircle2 className="size-4 text-emerald-500" /> : <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">Required</span>}
                </label>
                <input
                  id="request-vehicle-photo"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setRequestVehiclePhoto(event.target.files?.[0] || null)}
                  className="w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                />
              </div>

              {/* 3. Ảnh cận cảnh biển số */}
              <div className="rounded-lg border bg-background p-3 space-y-1.5">
                <label className="flex items-center justify-between text-xs font-semibold text-foreground cursor-pointer" htmlFor="request-plate-photo">
                  <span className="flex items-center gap-1.5">
                    <Camera className="size-4 text-primary" />
                    3. License Plate Close-up Photo (Ảnh cận cảnh biển số)<span className="text-destructive"> *</span>
                  </span>
                  {requestPlatePhoto ? <CheckCircle2 className="size-4 text-emerald-500" /> : <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">Required</span>}
                </label>
                <input
                  id="request-plate-photo"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setRequestPlatePhoto(event.target.files?.[0] || null)}
                  className="w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                />
              </div>
            </div>

            <Button
              type="button"
              className="mt-4 min-h-11 w-full font-semibold"
              disabled={requestingVehicle || !requestPlate.trim() || !requestEvidence || !requestVehiclePhoto || !requestPlatePhoto}
              onClick={() => void handleVehicleRequest()}
            >
              {requestingVehicle ? 'Submitting request...' : 'Submit Vehicle Request (3 Photos Attached)'}
            </Button>
          </div>
        </BaseDialogPopup>
      </BaseDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={Boolean(cancelId)} onOpenChange={(open) => { if (!open) setCancelId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this reservation?</AlertDialogTitle>
            <AlertDialogDescription>
              Your reserved spot will be released immediately. You can create another reservation after cancellation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep reservation</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => void handleCancel()}
            >
              Cancel reservation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Account Onboarding Prompt Dialog */}
      <AlertDialog open={showNewAccountPrompt} onOpenChange={setShowNewAccountPrompt}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Car className="size-6" />
            </div>
            <AlertDialogTitle className="text-center text-xl font-bold">
              Welcome to PBMS!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm leading-relaxed">
              We noticed your account doesn't have a linked vehicle yet. Register your vehicle now by uploading your <strong>Vehicle Registration Certificate (Cà vẹt xe)</strong> to unlock 20% discount parking spot reservations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <AlertDialogCancel className="min-h-11 w-full sm:w-auto">
              Maybe later
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 w-full font-semibold sm:w-auto"
              onClick={() => {
                setShowNewAccountPrompt(false)
                setShowVehicleRequest(true)
              }}
            >
              <Plus className="mr-1.5 size-4" />
              Register Vehicle Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CurrentReservationCard({
  reservation,
  onShowQr,
  onCancel,
}: {
  reservation: Reservation
  onShowQr: () => void
  onCancel: () => void
}) {
  const rawPlate = reservation.licensePlate ?? reservation.vehicle?.plateNumber ?? ''
  const plate = formatPlateForDisplay(rawPlate)
  const slot = reservation.slot

  return (
    <Card className="border-emerald-500/30 shadow-sm">
      <CardHeader className="border-b bg-emerald-500/5 pb-4 dark:bg-emerald-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="border-emerald-500/30 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300">
              Active Reservation
            </Badge>
            <Badge className="border-emerald-600/30 bg-emerald-600 text-white font-bold text-[10px]">
              20% OFF FEE
            </Badge>
          </div>
          <Badge variant="outline" className="gap-1 text-xs font-medium">
            <Car className="size-3.5" />
            {formatVehicleType(reservation.vehicleType)}
          </Badge>
        </div>
        <CardTitle className="mt-2.5 text-xl font-bold">Your Spot is Reserved</CardTitle>
        <CardDescription>Present your license plate or QR code at the gate. Enjoy a 20% discount on standard parking rates.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 p-5 sm:p-6">
        {/* Main Details Box */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/40 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reserved Vehicle</p>
            <p className="mt-1 font-mono text-2xl font-black tracking-wider text-foreground">{plate}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Allocated Spot</p>
            <p className="mt-1 text-base font-extrabold text-primary">
              {slot ? `Slot ${slot.code}` : 'Auto-assigned at gate'}
            </p>
          </div>
        </div>

        {/* Countdown Banner */}
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-900 dark:text-amber-200">
          <Clock3 className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <Countdown expiresAt={reservation.expiresAt} />
        </div>

        {/* Parking Journey Stepper */}
        <ParkingJourneyStepper reservation={reservation} />

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button type="button" size="lg" className="min-h-11 flex-1 font-semibold shadow-sm" onClick={onShowQr}>
            <QrCode className="mr-2 size-4" />
            Digital Parking Pass
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            onClick={onCancel}
          >
            Cancel reservation
          </Button>
        </div>

        {/* Footer Info Row */}
        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span>Booked at</span>
          <span className="font-medium text-foreground">{formatDateTimeVN(reservation.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function ParkingJourneyStepper({ reservation }: { reservation: Reservation }) {
  const steps = [
    {
      id: 'created',
      label: 'Reservation Created',
      description: 'Spot held in system',
      status: 'completed',
    },
    {
      id: 'slot',
      label: 'Slot Assigned',
      description: reservation.slot ? `Slot ${reservation.slot.code}` : 'Auto-allocated',
      status: 'completed',
    },
    {
      id: 'arrival',
      label: 'Waiting for Arrival',
      description: 'Drive to PBMS Tower gate',
      status: 'active',
    },
    {
      id: 'checkin',
      label: 'Vehicle Check-in',
      description: 'OCR recognition or QR scan',
      status: 'pending',
    },
    {
      id: 'parking',
      label: 'Parking Active',
      description: 'Vehicle parked in allocated spot',
      status: 'pending',
    },
    {
      id: 'completed',
      label: 'Completed',
      description: 'Gate checkout & session closed',
      status: 'pending',
    },
  ]

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3.5 flex items-center justify-between border-b pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
          </span>
          <p className="text-xs font-bold uppercase tracking-wider text-foreground">Parking Journey</p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          Live Tracking
        </Badge>
      </div>

      <div className="space-y-3">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'completed'
          const isActive = step.status === 'active'

          return (
            <div key={step.id} className="relative flex items-start gap-3">
              {/* Connector line */}
              {idx < steps.length - 1 ? (
                <div
                  className={`absolute left-2.5 top-5 h-full w-0.5 -translate-x-1/2 ${
                    isCompleted ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                  }`}
                />
              ) : null}

              {/* Step Circle Indicator */}
              <div className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full">
                {isCompleted ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                    <CheckCircle2 className="size-3.5 stroke-[3]" />
                  </span>
                ) : isActive ? (
                  <span className="relative flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-4 ring-amber-500/20 dark:ring-amber-500/30">
                    <span className="size-2 rounded-full bg-white animate-pulse" />
                  </span>
                ) : (
                  <span className="size-4 rounded-full border-2 border-muted-foreground/30 bg-background" />
                )}
              </div>

              {/* Step Label & Subtitle */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-semibold ${
                      isCompleted
                        ? 'text-foreground font-bold'
                        : isActive
                          ? 'text-amber-600 dark:text-amber-400 font-extrabold'
                          : 'text-muted-foreground/80'
                    }`}
                  >
                    {step.label}
                  </p>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 shadow-xs">
                      <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
                      In Progress
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReserveVehicleForm({
  vehicles,
  selectedVehicle,
  creating,
  quota,
  actionError,
  requests = [],
  onSelect,
  onCreate,
  onRequestVehicle,
}: {
  vehicles: DriverVehicle[]
  selectedVehicle: DriverVehicle | null
  creating: boolean
  quota: ReservationQuotaSnapshot | null
  actionError: string | null
  requests?: VehicleRegistrationRequest[]
  onSelect: (id: string) => void
  onCreate: () => void
  onRequestVehicle: () => void
}) {
  const [, refresh] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => refresh((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const cooldownActive = Boolean(quota?.cooldownUntil && new Date(quota.cooldownUntil).getTime() > Date.now())
  const quotaReached = quota?.remaining === 0
  const disabled = creating || !selectedVehicle || cooldownActive || quotaReached

  const pendingRequest = requests.find((r) => r.status === 'pending')

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">New Reservation</p>
        <CardTitle className="text-xl font-bold">Reserve a Parking Spot</CardTitle>
        <CardDescription>Select a linked vehicle to reserve a spot in the building.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 p-6 pt-0">
        {vehicles.length === 0 ? (
          pendingRequest ? (
            <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent p-5 sm:p-6 shadow-sm dark:border-sky-400/20 dark:from-sky-500/15">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-500/20 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-300">
                    <Clock3 className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground">Vehicle Registration Pending Review</h4>
                    <p className="text-xs text-muted-foreground">Your document has been submitted for manager verification.</p>
                  </div>
                </div>
                <Badge className="border-sky-500/40 bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold text-xs px-3 py-1 self-start sm:self-auto">
                  <span className="mr-1.5 size-2 rounded-full bg-sky-500 animate-ping inline-block" />
                  Pending Approval
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3 rounded-xl border bg-background/80 p-3.5 backdrop-blur">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plate Number</p>
                  <p className="mt-0.5 font-mono text-base font-black tracking-wider text-foreground">{formatPlateForDisplay(pendingRequest.plateNumber)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vehicle Type</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{formatVehicleType(pendingRequest.vehicleType)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Submitted At</p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">{formatDateTimeVN(pendingRequest.createdAt)}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  Once approved by manager, this vehicle will appear in your reservation list.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-9 font-semibold text-xs border-sky-500/30 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300 shrink-0"
                  onClick={onRequestVehicle}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Register Another Vehicle
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="flex items-center justify-between">
                <p className="font-semibold">No Linked Vehicles Available</p>
                <Button type="button" size="sm" onClick={onRequestVehicle}>
                  <Plus className="mr-1 size-3.5" />
                  Request Link
                </Button>
              </div>
              <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
                Reservations require a verified vehicle linked to your account.
              </p>
            </div>
          )
        ) : (
          <>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm font-semibold text-foreground">Choose Vehicle</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={onRequestVehicle}
                >
                  <Plus className="mr-1 size-3.5" />
                  Request new vehicle link
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {vehicles.map((vehicle) => {
                  const isSelected = selectedVehicle?.id === vehicle.id
                  return (
                    <button
                      key={vehicle.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={creating}
                      onClick={() => onSelect(vehicle.id)}
                      className={`flex min-h-20 flex-col justify-between rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 ${
                        isSelected
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                          : 'bg-card hover:border-primary/40 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-base font-extrabold tracking-wider text-foreground">
                          {formatPlateForDisplay(vehicle.plateNumber)}
                        </span>
                        <Badge variant={isSelected ? 'default' : 'outline'} className="text-[10px]">
                          {formatVehicleType(vehicle.vehicleType)}
                        </Badge>
                      </div>
                      <span className="mt-2 text-xs font-medium text-muted-foreground capitalize">
                        Role: {vehicle.linkedRole}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {pendingRequest ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200">
                <span>Request for <strong>{formatPlateForDisplay(pendingRequest.plateNumber)}</strong> is pending manager review.</span>
              </div>
            ) : null}

            {actionError ? (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
                {actionError}
              </p>
            ) : null}

            <Button
              type="button"
              size="lg"
              className="min-h-12 w-full text-base font-semibold shadow-sm"
              disabled={disabled}
              onClick={onCreate}
            >
              {creating
                ? 'Allocating spot...'
                : `Reserve spot for ${formatPlateForDisplay(selectedVehicle?.plateNumber ?? 'selected vehicle')}`}
            </Button>

            <QuotaNote quota={quota} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function QuotaNote({ quota }: { quota: ReservationQuotaSnapshot | null }) {
  if (!quota) return <p className="text-xs text-muted-foreground">Checking quota limits...</p>
  const cooldownUntil = quota.cooldownUntil ? new Date(quota.cooldownUntil) : null
  if (cooldownUntil && cooldownUntil.getTime() > Date.now())
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
        <CircleAlert className="size-4 shrink-0" />
        <span>Cooldown active after cancellation. Try again in {formatCountdown(cooldownUntil)}.</span>
      </div>
    )
  if (quota.remaining <= 0)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
        <CircleAlert className="size-4 shrink-0" />
        <span>Daily reservation limit reached. Reset at {formatClock(quota.windowResetAt)}.</span>
      </div>
    )
  return (
    <p className="text-xs font-medium text-muted-foreground">
      Quota: You have <strong className="text-foreground">{quota.remaining}</strong> reservation{quota.remaining === 1 ? '' : 's'} remaining before {formatClock(quota.windowResetAt)}.
    </p>
  )
}



function ReservationHistoryList({ reservations }: { reservations: Reservation[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? reservations : reservations.slice(0, 3)

  if (reservations.length === 0)
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="p-5 text-center text-xs text-muted-foreground">No previous reservations found.</CardContent>
      </Card>
    )

  return (
    <section aria-labelledby="previous-reservations" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">History</p>
          <h2 id="previous-reservations" className="text-base font-semibold">Previous Reservations</h2>
        </div>
        {reservations.length > 3 ? (
          <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Show less' : 'View all'}
            {expanded ? <ChevronUp className="ml-1 size-3.5" /> : <ChevronDown className="ml-1 size-3.5" />}
          </Button>
        ) : null}
      </div>
      <div className="space-y-2.5">
        {visible.map((reservation) => (
          <PreviousReservationRow key={reservation.id} reservation={reservation} />
        ))}
      </div>
    </section>
  )
}

function PreviousReservationRow({ reservation }: { reservation: Reservation }) {
  const status = STATUS_LABELS[reservation.status] ?? STATUS_LABELS.expired
  const Icon = status.icon
  const rawPlate = reservation.licensePlate ?? reservation.vehicle?.plateNumber ?? ''
  const plate = rawPlate ? formatPlateForDisplay(rawPlate) : 'Vehicle unavailable'

  return (
    <Card className="shadow-none transition hover:border-primary/30">
      <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-bold tracking-wider text-foreground">{plate}</p>
            <Badge variant="outline" className="text-[10px]">
              {formatVehicleType(reservation.vehicleType)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {reservation.slot ? `Slot ${reservation.slot.code}` : 'Slot unallocated'}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatDateTimeVN(reservation.createdAt)}</p>
        </div>
        <Badge variant="outline" className={`shrink-0 gap-1 px-2.5 py-1 text-xs font-semibold ${status.tone}`}>
          <Icon className="size-3.5" />
          {status.text}
        </Badge>
      </CardContent>
    </Card>
  )
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt))
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(calcRemaining(expiresAt)), 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  if (remaining <= 0) return <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">Reservation expired</span>
  return (
    <span className="text-sm font-semibold">
      Arrive within{' '}
      <span className="font-mono text-base font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
        {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}
      </span>
    </span>
  )
}

function calcRemaining(expiresAt: string) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatCountdown(value: Date) {
  const remaining = Math.max(0, Math.ceil((value.getTime() - Date.now()) / 1000))
  return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
}
