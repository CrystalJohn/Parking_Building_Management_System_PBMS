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
  getMyActiveSessions,
  getMyReservations,
  getMyVehicleRegistrationRequests,
  getMyVehicles,
  getPricing,
  getReservationQuota,
  payReservationDeposit,
  type ActiveSession,
  type DriverVehicle,
  type PricingInfo,
  type Reservation,
  type ReservationQuotaSnapshot,
  type VehicleRegistrationRequest,
  type VehicleType,
} from '../../lib/driver-api'
import { ReservationCheckInQr } from '../../components/driver/ReservationCheckInQr'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatVehicleType } from '../../lib/plate-format'

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
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])
  const [pricing, setPricing] = useState<PricingInfo[]>([])
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
  const [vnpayModalUrl, setVnpayModalUrl] = useState<string | null>(null)
  const [vnpayModalAmount] = useState<number>(8000)
  const paramVehicle = searchParams.get('vehicleId')
  const actionParam = searchParams.get('action')
  const mountRef = useRef(false)

  const loadPage = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [vehicleData, reservationData, quotaData, requestData, pricingData, activeSessionsData] = await Promise.all([
        getMyVehicles(),
        getMyReservations(),
        getReservationQuota(),
        getMyVehicleRegistrationRequests(),
        getPricing(),
        getMyActiveSessions().catch(() => []),
      ])
      setVehicles(vehicleData)
      setReservations(reservationData)
      setQuota(quotaData)
      setRegistrationRequests(requestData)
      setPricing(pricingData)
      setActiveSessions(activeSessionsData)
      setShowQr(false)
      if (vehicleData.length === 0 && requestData.length === 0) {
        setShowNewAccountPrompt(true)
      }
    } catch {
      if (!silent) setError('Unable to load reservation data. Retry to continue.')
    } finally {
      if (!silent) setLoading(false)
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
      void loadPage(false)
    }
    const onFocus = () => {
      void loadPage(true)
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
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

  const handleCreate = async (plannedArrivalAtISO?: string) => {
    if (!selectedVehicle) {
      setActionError('Choose a linked vehicle before reserving a spot.')
      return
    }
    setCreating(true)
    setActionError(null)
    try {
      const response = await createReservation(selectedVehicle.id, plannedArrivalAtISO)
      setQuota(response.quota)
      await loadPage()
      if (response.paymentUrl) {
        window.open(response.paymentUrl, '_blank')
      }
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
    const plate = requestPlate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!plate) {
      setActionError('Vui lòng nhập biển số xe.')
      return
    }
    if (!requestEvidence || !requestVehiclePhoto || !requestPlatePhoto) {
      setActionError('Vui lòng tải lên đủ 3 hình ảnh xác minh (Cà vẹt, Xe và Biển số).')
      return
    }

    // Pre-verification check: ensure 3 valid distinct image files
    if (
      requestEvidence.size < 5120 ||
      requestVehiclePhoto.size < 5120 ||
      requestPlatePhoto.size < 5120
    ) {
      setActionError('Xác minh ảnh thất bại: Kích thước ảnh quá nhỏ (< 5KB), bị lỗi hoặc mờ. Vui lòng chọn ảnh chụp rõ nét hơn.')
      return
    }

    if (
      (requestEvidence.name === requestVehiclePhoto.name && requestEvidence.size === requestVehiclePhoto.size) ||
      (requestEvidence.name === requestPlatePhoto.name && requestEvidence.size === requestPlatePhoto.size) ||
      (requestVehiclePhoto.name === requestPlatePhoto.name && requestVehiclePhoto.size === requestPlatePhoto.size)
    ) {
      setActionError('Xác minh ảnh thất bại: 3 ảnh chọn bị trùng lặp. Vui lòng chọn 3 ảnh riêng biệt cho Cà vẹt, Xe và Biển số.')
      return
    }

    setRequestingVehicle(true)
    setActionError(null)
    try {
      const request = await createVehicleRegistrationRequest(plate, requestType, requestEvidence, requestVehiclePhoto, requestPlatePhoto)
      setRegistrationRequests((current) => [request, ...current])
      await loadPage()
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
                  activeSessions={activeSessions}
                  creating={creating}
                  quota={quota}
                  actionError={actionError}
                  requests={registrationRequests}
                  pricing={pricing}
                  onSelect={setSelectedVehicleId}
                  onCreate={(plannedArrivalISO) => void handleCreate(plannedArrivalISO)}
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

              {/* Pricing Table Card */}
              {pricing.length > 0 && (
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-primary" />
                      <CardTitle className="text-sm font-bold">Parking Fee Schedule</CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground">Current effective rates at PBMS Tower</p>
                  </CardHeader>
                  <CardContent className="p-0 pb-4">
                    <div className="overflow-hidden rounded-b-xl">
                      {/* Header */}
                      <div className="grid grid-cols-3 bg-muted/60 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <span>Vehicle Type</span>
                        <span className="text-center">Standard Rate</span>
                        <span className="text-right">Pre-booked (-{pricing[0]?.reservationDiscountPercent ?? 20}%)</span>
                      </div>
                      {pricing.map((p) => {
                        const discountPct = p.reservationDiscountPercent ?? 20
                        const discounted = Math.round(p.hourlyRate * (1 - discountPct / 100))
                        const label = p.vehicleType === 'car' ? '🚗 Car' : '🏍️ Motorbike'
                        return (
                          <div key={p.vehicleType} className="grid grid-cols-3 items-center border-t px-4 py-3">
                            <span className="text-xs font-semibold">{label}</span>
                            <span className="text-center font-mono text-xs text-muted-foreground line-through">
                              {p.hourlyRate.toLocaleString('vi-VN')}đ/h
                            </span>
                            <span className="text-right font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                              {discounted.toLocaleString('vi-VN')}đ/h
                            </span>
                          </div>
                        )
                      })}
                      <div className="border-t bg-amber-50/60 px-4 py-2.5 dark:bg-amber-500/5">
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                          💡 Pay 1-hour deposit at pre-booked rate. Remaining balance paid at exit gate.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

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

      {/* VNPAY-QR & Payment Gateway Dialog Modal */}
      <BaseDialog open={Boolean(vnpayModalUrl)} onOpenChange={(open) => !open && setVnpayModalUrl(null)}>
        <BaseDialogPopup from="top" className="sm:max-w-md text-center">
          <BaseDialogHeader>
            <BaseDialogTitle className="flex items-center justify-center gap-2 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-6 text-emerald-600" />
              Cổng Thanh toán VNPAY-QR Sandbox
            </BaseDialogTitle>
            <BaseDialogDescription className="text-xs">
              Website Merchant (TMN Code): <strong className="font-mono text-foreground font-bold">98VPQPTA</strong>
            </BaseDialogDescription>
          </BaseDialogHeader>

          <div className="space-y-4 py-2">
            {/* Amount Display */}
            <div className="rounded-xl border bg-emerald-500/10 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Số tiền cọc cần thanh toán</p>
              <p className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {vnpayModalAmount.toLocaleString('vi-VN')} VNĐ
              </p>
            </div>

            {/* QR Code Container */}
            {vnpayModalUrl && (
              <div className="flex flex-col items-center justify-center rounded-2xl border bg-white p-4 shadow-inner space-y-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(vnpayModalUrl)}`}
                  alt="VNPAY-QR Code"
                  className="size-52 rounded-lg border p-2 shadow-sm"
                />
                <span className="text-[11px] font-bold text-slate-700">
                  Quét mã VNPAY-QR bằng App Ngân hàng hoặc VNPAY App
                </span>
              </div>
            )}

            {/* Direct Portal Button */}
            <Button
              type="button"
              size="lg"
              className="w-full font-bold min-h-12 text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
              onClick={() => {
                if (vnpayModalUrl) window.location.href = vnpayModalUrl
              }}
            >
              <ShieldCheck className="mr-2 size-5" />
              Mở Cổng VNPay Sandbox (Nhập thẻ NCB / VISA)
            </Button>
            {/* Card Info Helper */}
            <div className="rounded-xl border bg-muted/30 p-3 text-left text-xs space-y-1 text-muted-foreground">
              <p className="font-bold text-foreground text-[11px] uppercase tracking-wider">Thẻ NCB Thử nghiệm (Thành công):</p>
              <p>• Ngân hàng: <strong>NCB</strong> | Số thẻ: <code className="font-mono text-foreground font-bold">9704198526191432198</code></p>
              <p>• Tên chủ thẻ: <strong>NGUYEN VAN A</strong> | Ngày PH: <strong>07/15</strong> | OTP: <strong>123456</strong></p>
            </div>
          </div>
        </BaseDialogPopup>
      </BaseDialog>
    </div>
  )
}

function ArrivalCountdown({
  plannedArrivalAt,
  expiresAt,
  isPaid,
}: {
  plannedArrivalAt?: string | null
  expiresAt: string
  isPaid: boolean
}) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const plannedTime = plannedArrivalAt ? new Date(plannedArrivalAt).getTime() : null
  const expireTime = new Date(expiresAt).getTime()

  if (!isPaid) {
    const diffSec = Math.max(0, Math.floor((expireTime - now) / 1000))
    const m = Math.floor(diffSec / 60)
    const s = diffSec % 60
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-rose-900 dark:text-rose-200">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Clock3 className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>Online deposit payment deadline:</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-black text-rose-600 dark:text-rose-400 tabular-nums">
            {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
          </span>
          <Badge variant="destructive" className="text-[10px] font-bold">Auto-cancels in 15m</Badge>
        </div>
      </div>
    )
  }

  if (plannedTime && now < plannedTime) {
    const diffSec = Math.max(0, Math.floor((plannedTime - now) / 1000))
    const h = Math.floor(diffSec / 3600)
    const m = Math.floor((diffSec % 3600) / 60)
    const s = diffSec % 60
    const formattedDiff = h > 0 
      ? `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
      : `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`

    return (
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 space-y-2 text-cyan-950 dark:text-cyan-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Clock3 className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span>Planned Arrival: <strong className="font-mono text-sm">{formatDateTimeVN(new Date(plannedTime))}</strong></span>
          </div>
          <Badge className="border-cyan-500/40 bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 font-bold text-xs">
            ⏰ Arrival Countdown
          </Badge>
        </div>
        <div className="flex items-baseline justify-between border-t border-cyan-500/20 pt-2">
          <span className="text-xs font-medium text-cyan-800 dark:text-cyan-200">Time Remaining:</span>
          <span className="font-mono text-xl font-extrabold text-cyan-700 dark:text-cyan-300 tabular-nums">
            {formattedDiff}
          </span>
        </div>
        <div className="space-y-1 pt-1 text-[11px] text-cyan-700 dark:text-cyan-300 leading-tight">
          <p className="italic">
            💡 You can arrive early anytime! Gate check-in is allowed whenever a spot is available.
          </p>
          <p className="font-semibold text-rose-700 dark:text-rose-300">
            ⚠️ Grace Expiry Rule: You have up to 15 minutes grace period past planned arrival. After <strong>{formatDateTimeVN(new Date(expireTime))}</strong> (+15m late), the reservation will <strong>automatically expire</strong> and be cancelled.
          </p>
        </div>
      </div>
    )
  }

  // Arrival window active or grace period
  const diffSec = Math.max(0, Math.floor((expireTime - now) / 1000))
  const m = Math.floor(diffSec / 60)
  const s = diffSec % 60

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-4 space-y-2 text-amber-950 dark:text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
          <Clock3 className="size-4 text-amber-600 shrink-0" />
          <span>Arrival window active! Awaiting gate entry.</span>
        </div>
        <Badge className="border-amber-500/40 bg-amber-500 text-white font-bold text-xs animate-pulse">
          🔥 Arrival Window Active
        </Badge>
      </div>
      <div className="flex items-baseline justify-between border-t border-amber-500/20 pt-2">
        <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Latest gate entry (+15m grace expiry):</span>
        <span className="font-mono text-xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
          {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
        </span>
      </div>
      <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">
        ⚠️ Exceeding 15-minute grace period ({formatDateTimeVN(new Date(expireTime))}), this reservation will automatically be cancelled by system.
      </p>
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
  const plate = reservation.plateDisplay ?? rawPlate
  const isPaid = Boolean(reservation.isDepositPaid)
  const depositAmt = reservation.depositAmount || (reservation.vehicleType === 'car' ? 16000 : 8000)

  return (
    <Card className={`shadow-sm ${isPaid ? 'border-emerald-500/30' : 'border-amber-500/40 bg-amber-500/5'}`}>
      <CardHeader className={`border-b pb-4 ${isPaid ? 'bg-emerald-500/5 dark:bg-emerald-500/10' : 'bg-amber-500/10'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={isPaid ? 'border-emerald-500/30 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300' : 'border-amber-500/30 bg-amber-500 text-white font-bold'}>
              {isPaid ? 'Active Reservation' : 'Pending Deposit Payment'}
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
        <CardTitle className="mt-2.5 text-xl font-bold">
          {isPaid ? 'Your Spot is Guaranteed' : '1-Hour Deposit Required'}
        </CardTitle>
        <CardDescription>
          {isPaid
            ? 'Present your license plate or QR code at entrance gate. Enjoy 20% discount on parking fees.'
            : `Please pay 1-hour deposit (${depositAmt.toLocaleString('vi-VN')} VNĐ) via VNPay Sandbox to activate your reservation.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 p-5 sm:p-6">
        {/* Main Details Box */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/40 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">RESERVED VEHICLE</p>
            <p className="mt-1 font-mono text-2xl font-black tracking-wider text-foreground">{plate}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">VEHICLE TYPE</p>
            <p className="mt-1 font-sans text-sm font-bold text-primary">
              {reservation.vehicleType === 'car' ? 'Car' : 'Motorbike'}
            </p>
          </div>
        </div>

        {/* Planned Arrival Time & Countdown */}
        <ArrivalCountdown
          plannedArrivalAt={reservation.plannedArrivalAt}
          expiresAt={reservation.expiresAt}
          isPaid={isPaid}
        />

        {/* Parking Journey Stepper */}
        <ParkingJourneyStepper reservation={reservation} />

        {!isPaid ? (
          /* Unpaid Deposit Alert & Pay Actions */
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
              <Clock3 className="size-4 text-amber-600 shrink-0" />
              <span>1-Hour Deposit Required to Complete Reservation</span>
            </div>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
              You have 15 minutes to pay the <strong>{depositAmt.toLocaleString('vi-VN')} VNĐ</strong> deposit via VNPay Sandbox. Once paid, your spot capacity will be fully protected.
            </p>
            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button
                type="button"
                size="lg"
                className="flex-1 font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                onClick={async () => {
                  try {
                    const data = await payReservationDeposit(reservation.id)
                    if (data.paymentUrl) window.open(data.paymentUrl, '_blank')
                  } catch {
                    window.open('http://sandbox.vnpayment.vn/tryitnow/Home/CreateOrder', '_blank')
                  }
                }}
              >
                <ShieldCheck className="mr-2 size-4" />
                Pay VNPay Sandbox Deposit Now
              </Button>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="font-bold border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300"
                onClick={onCancel}
              >
                Cancel Reservation
              </Button>
            </div>
          </div>
        ) : (
          /* Paid Deposit: Action Buttons */
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button type="button" size="lg" className="min-h-11 flex-1 font-semibold shadow-sm" onClick={onShowQr}>
              <QrCode className="mr-2 size-4" />
              Digital Gate Pass
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              onClick={onCancel}
            >
              Cancel Reservation
            </Button>
          </div>
        )}

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
  const isPaid = Boolean(reservation.isDepositPaid)

  const steps = isPaid
    ? [
        {
          id: 'created',
          label: 'Reservation Created',
          description: 'Recorded in system',
          status: 'completed',
        },
        {
          id: 'slot',
          label: 'Spot Protection Active',
          description: 'Capacity guaranteed for arrival',
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
          description: 'OCR plate recognition or QR scan',
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
    : [
        {
          id: 'deposit',
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

function ManualTimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (isoString: string) => void
  disabled?: boolean
}) {
  // Ticking live clock
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today')

  // Strict 60 min (3,600,000 ms) lead time threshold
  const minValidTimestamp = useMemo(() => now.getTime() + 60 * 60_000, [now])
  const maxValidTimestamp = useMemo(() => now.getTime() + 24 * 60 * 60 * 1000, [now])

  const isTimeValid = (day: 'today' | 'tomorrow', h: number, m: number) => {
    const targetDayStr = day === 'today' ? todayStr : tomorrowStr
    const [year, month, d] = targetDayStr.split('-').map(Number)
    const targetDate = new Date(year, month - 1, d, h, m, 0)
    const ts = targetDate.getTime()
    return ts >= minValidTimestamp && ts <= maxValidTimestamp
  }

  // Find first valid time for initial state
  const firstValidTime = useMemo(() => {
    for (let h = 0; h <= 23; h++) {
      for (let m of [0, 15, 30, 45]) {
        if (isTimeValid('today', h, m)) {
          return { day: 'today' as const, hour: h, minute: m }
        }
      }
    }
    for (let h = 0; h <= 23; h++) {
      for (let m of [0, 15, 30, 45]) {
        if (isTimeValid('tomorrow', h, m)) {
          return { day: 'tomorrow' as const, hour: h, minute: m }
        }
      }
    }
    return { day: 'tomorrow' as const, hour: 8, minute: 0 }
  }, [minValidTimestamp, maxValidTimestamp])

  const [selectedHour, setSelectedHour] = useState<number>(firstValidTime.hour)
  const [selectedMinute, setSelectedMinute] = useState<number>(firstValidTime.minute)

  useEffect(() => {
    updateISO(selectedDay, selectedHour, selectedMinute)
  }, [selectedDay, selectedHour, selectedMinute])

  const updateISO = (day: 'today' | 'tomorrow', h: number, m: number) => {
    const targetDayStr = day === 'today' ? todayStr : tomorrowStr
    const [year, month, d] = targetDayStr.split('-').map(Number)
    const targetDate = new Date(year, month - 1, d, h, m, 0)
    onChange(targetDate.toISOString())
  }

  // Available hours for the selected day
  const availableHours = useMemo(() => {
    const hours: number[] = []
    for (let h = 0; h <= 23; h++) {
      if ([0, 15, 30, 45].some((m) => isTimeValid(selectedDay, h, m))) {
        hours.push(h)
      }
    }
    return hours
  }, [selectedDay, minValidTimestamp, maxValidTimestamp])

  // Available minutes for the selected day and hour
  const availableMinutes = useMemo(() => {
    return [0, 15, 30, 45].filter((m) => isTimeValid(selectedDay, selectedHour, m))
  }, [selectedDay, selectedHour, minValidTimestamp, maxValidTimestamp])

  // Real-time auto-correct: if time ticks and selected slot drops below 60 min, auto-select next valid slot without page reload
  useEffect(() => {
    if (availableHours.length > 0 && !availableHours.includes(selectedHour)) {
      const nextH = availableHours[0]
      const validMins = [0, 15, 30, 45].filter((m) => isTimeValid(selectedDay, nextH, m))
      const nextM = validMins[0] ?? 0
      setSelectedHour(nextH)
      setSelectedMinute(nextM)
      updateISO(selectedDay, nextH, nextM)
    } else if (availableMinutes.length > 0 && !availableMinutes.includes(selectedMinute)) {
      const nextM = availableMinutes[0]
      setSelectedMinute(nextM)
      updateISO(selectedDay, selectedHour, nextM)
    }
  }, [now, selectedDay, availableHours, availableMinutes])

  const handleDayChange = (day: 'today' | 'tomorrow') => {
    setSelectedDay(day)
    for (let h = 0; h <= 23; h++) {
      const validMins = [0, 15, 30, 45].filter((m) => isTimeValid(day, h, m))
      if (validMins.length > 0) {
        const nextM = validMins[0]
        setSelectedHour(h)
        setSelectedMinute(nextM)
        updateISO(day, h, nextM)
        return
      }
    }
  }

  const handleHourChange = (h: number) => {
    setSelectedHour(h)
    const validMins = [0, 15, 30, 45].filter((m) => isTimeValid(selectedDay, h, m))
    const nextM = validMins.includes(selectedMinute) ? selectedMinute : (validMins[0] ?? 0)
    setSelectedMinute(nextM)
    updateISO(selectedDay, h, nextM)
  }

  const handleMinuteChange = (m: number) => {
    setSelectedMinute(m)
    updateISO(selectedDay, selectedHour, m)
  }

  const parsedTarget = useMemo(() => {
    if (!value) return new Date(now.getTime() + 60 * 60_000)
    const d = new Date(value)
    return isNaN(d.getTime()) ? new Date(now.getTime() + 60 * 60_000) : d
  }, [value, now])

  const diffMs = Math.max(0, parsedTarget.getTime() - now.getTime())
  const diffHours = Math.floor(diffMs / (3600 * 1000))
  const diffMins = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000))

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3.5 shadow-sm">
      {/* Real-Time Clock Header & Rule Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-primary animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            CURRENT TIME: {formatDateTimeVN(now)}
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
          At least 1h advance
        </Badge>
      </div>

      {/* Manual Dropdown Controls */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {/* Day Select */}
        <div className="space-y-1">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
            1. SELECT DATE:
          </label>
          <select
            value={selectedDay}
            disabled={disabled}
            onChange={(e) => handleDayChange(e.target.value as 'today' | 'tomorrow')}
            className="w-full h-10 rounded-xl border bg-background px-3 font-sans text-xs font-bold outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            <option value="today">Today ({todayStr.split('-').reverse().slice(0, 2).join('/')})</option>
            <option value="tomorrow">Tomorrow ({tomorrowStr.split('-').reverse().slice(0, 2).join('/')})</option>
          </select>
        </div>

        {/* Hour Select */}
        <div className="space-y-1">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
            2. SELECT HOUR:
          </label>
          <select
            value={selectedHour}
            disabled={disabled}
            onChange={(e) => handleHourChange(Number(e.target.value))}
            className="w-full h-10 rounded-xl border bg-background px-3 font-mono text-xs font-bold outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            {availableHours.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>

        {/* Minute Select */}
        <div className="space-y-1">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
            3. SELECT MINUTE:
          </label>
          <select
            value={selectedMinute}
            disabled={disabled}
            onChange={(e) => handleMinuteChange(Number(e.target.value))}
            className="w-full h-10 rounded-xl border bg-background px-3 font-mono text-xs font-bold outline-none focus:ring-2 focus:ring-primary shadow-sm"
          >
            {availableMinutes.map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')} mins
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Confirmation & Status Banner */}
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-950 dark:text-emerald-100 flex items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>Planned Arrival: <strong>{formatDateTimeVN(parsedTarget)}</strong></span>
        </div>
        <span className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
          (In {diffHours > 0 ? `${diffHours}h ${diffMins}m` : `${diffMins}m`})
        </span>
      </div>
    </div>
  )
}

function ReserveVehicleForm({
  vehicles,
  selectedVehicle,
  activeSessions = [],
  creating,
  quota,
  actionError,
  requests = [],
  pricing = [],
  onSelect,
  onCreate,
  onRequestVehicle,
}: {
  vehicles: DriverVehicle[]
  selectedVehicle: DriverVehicle | null
  activeSessions?: ActiveSession[]
  creating: boolean
  quota: ReservationQuotaSnapshot | null
  actionError: string | null
  requests?: VehicleRegistrationRequest[]
  pricing?: PricingInfo[]
  onSelect: (id: string) => void
  onCreate: (plannedArrivalISO?: string) => void
  onRequestVehicle: () => void
}) {
  const [, refresh] = useState(0)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [plannedArrivalInput, setPlannedArrivalInput] = useState('')
  useEffect(() => {
    const timer = window.setInterval(() => refresh((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const cooldownActive = Boolean(quota?.cooldownUntil && new Date(quota.cooldownUntil).getTime() > Date.now())
  const quotaReached = quota?.remaining === 0

  const parkedPlates = useMemo(() => {
    return new Set(activeSessions.map((s) => s.licensePlate))
  }, [activeSessions])

  const isSelectedVehicleParked = useMemo(() => {
    if (!selectedVehicle) return false
    return (
      parkedPlates.has(selectedVehicle.plateNumber) ||
      (selectedVehicle.plateDisplay ? parkedPlates.has(selectedVehicle.plateDisplay) : false)
    )
  }, [selectedVehicle, parkedPlates])

  const isInvalidArrival = useMemo(() => {
    if (!plannedArrivalInput) return false
    const d = new Date(plannedArrivalInput)
    if (isNaN(d.getTime())) return true
    const now = Date.now()
    return d.getTime() < now - 2 * 60_000 || d.getTime() > now + 24 * 60 * 60 * 1000
  }, [plannedArrivalInput])

  const disabled = creating || !selectedVehicle || cooldownActive || quotaReached || isInvalidArrival || isSelectedVehicleParked

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const rejectedRequests = requests.filter((r) => r.status === 'rejected')

  const vehicleType = selectedVehicle?.vehicleType ?? 'car'
  const isCar = vehicleType === 'car'

  // Dùng giá từ DB (pricingConfig) nếu có, fallback hardcode
  const pricingForType = pricing.find((p) => p.vehicleType === vehicleType)
  const DISCOUNT_PERCENT = pricingForType?.reservationDiscountPercent ?? 20
  const baseRate = pricingForType?.hourlyRate ?? (isCar ? 20000 : 10000)
  const discountedRate = Math.round(baseRate * (1 - DISCOUNT_PERCENT / 100))
  const depositAmount = discountedRate

  const handleConfirmAndPay = () => {
    setShowPricingModal(false)
    const plannedIso = plannedArrivalInput ? new Date(plannedArrivalInput).toISOString() : undefined
    onCreate(plannedIso)
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">New Reservation</p>
        <CardTitle className="text-xl font-bold">Reserve a Parking Spot</CardTitle>
        <CardDescription>Select a linked vehicle to reserve a spot in the building.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 p-6 pt-0">
        {vehicles.length === 0 ? (
          pendingRequests.length > 0 || rejectedRequests.length > 0 ? (
            <div className="space-y-5">
              {/* Pending Requests Section */}
              {pendingRequests.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Pending Vehicle Registrations ({pendingRequests.length})
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 font-semibold text-xs border-sky-500/30 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"
                      onClick={onRequestVehicle}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Register Another Vehicle
                    </Button>
                  </div>

                  {pendingRequests.map((pendingReq) => (
                    <div key={pendingReq.id} className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent p-5 sm:p-6 shadow-sm dark:border-sky-400/20 dark:from-sky-500/15">
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
                          <p className="mt-0.5 font-mono text-base font-black tracking-wider text-foreground">{pendingReq.plateDisplay ?? pendingReq.plateNumber}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vehicle Type</p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">{formatVehicleType(pendingReq.vehicleType)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Submitted At</p>
                          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{formatDateTimeVN(pendingReq.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Rejected Requests Section */}
              {rejectedRequests.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      Rejected Vehicle Registrations ({rejectedRequests.length})
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 font-semibold text-xs bg-rose-600 hover:bg-rose-700 text-white"
                      onClick={onRequestVehicle}
                    >
                      <Plus className="mr-1.5 size-3.5" />
                      Re-submit Vehicle Request
                    </Button>
                  </div>

                  {rejectedRequests.map((rejReq) => (
                    <div key={rejReq.id} className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent p-5 sm:p-6 shadow-sm dark:border-rose-400/20 dark:from-rose-500/15">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-500/20 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400">
                            <XCircle className="size-5" />
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-foreground">Vehicle Registration Request Rejected</h4>
                            <p className="text-xs text-muted-foreground">Your registration request was reviewed and rejected by Manager.</p>
                          </div>
                        </div>
                        <Badge variant="destructive" className="font-bold text-xs px-3 py-1 self-start sm:self-auto">
                          Request Rejected
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3 rounded-xl border bg-background/80 p-3.5 backdrop-blur">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plate Number</p>
                          <p className="mt-0.5 font-mono text-base font-black tracking-wider text-foreground">{rejReq.plateDisplay ?? rejReq.plateNumber}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vehicle Type</p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground">{formatVehicleType(rejReq.vehicleType)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Submitted At</p>
                          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{formatDateTimeVN(rejReq.createdAt)}</p>
                        </div>
                      </div>

                      {rejReq.rejectReason ? (
                        <div className="mt-3.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-200">
                          <strong className="font-bold">Manager Reason:</strong> {rejReq.rejectReason}
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <p className="text-xs text-muted-foreground">
                          Please check your 3 verification photos and submit a new request.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-9 font-semibold text-xs bg-rose-600 hover:bg-rose-700 text-white shrink-0"
                          onClick={onRequestVehicle}
                        >
                          <Plus className="mr-1.5 size-3.5" />
                          Re-submit Request (3 Photos)
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
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
                  const isParked =
                    parkedPlates.has(vehicle.plateNumber) ||
                    (vehicle.plateDisplay ? parkedPlates.has(vehicle.plateDisplay) : false)

                  return (
                    <button
                      key={vehicle.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={creating || isParked}
                      onClick={() => onSelect(vehicle.id)}
                      className={`flex min-h-20 flex-col justify-between rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 ${
                        isSelected
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/40'
                          : isParked
                            ? 'border-amber-500/30 bg-amber-500/5 cursor-not-allowed'
                            : 'bg-card hover:border-primary/40 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-base font-extrabold tracking-wider text-foreground">
                          {vehicle.plateDisplay ?? vehicle.plateNumber}
                        </span>
                        {isParked ? (
                          <Badge className="border-amber-500/40 bg-amber-500/20 text-amber-800 dark:text-amber-200 text-[10px] font-bold">
                            Parked in Building
                          </Badge>
                        ) : (
                          <Badge variant={isSelected ? 'default' : 'outline'} className="text-[10px]">
                            {formatVehicleType(vehicle.vehicleType)}
                          </Badge>
                        )}
                      </div>
                      <span className="mt-2 text-xs font-medium text-muted-foreground capitalize">
                        {isParked ? '⚠️ Currently parked inside building' : `Role: ${vehicle.linkedRole}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Warning if selected vehicle is currently parked inside building */}
            {isSelectedVehicleParked ? (
              <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 font-semibold space-y-1">
                <p className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100">
                  <CircleAlert className="size-4 text-amber-600 shrink-0" />
                  Vehicle Currently Parked Inside Building
                </p>
                <p className="text-[11px] font-normal text-amber-800 dark:text-amber-200 leading-relaxed">
                  Vehicle <strong>{selectedVehicle?.plateDisplay ?? selectedVehicle?.plateNumber}</strong> is currently parked in PBMS Tower. You cannot create a reservation for a vehicle that is already inside the building.
                </p>
              </div>
            ) : null}

            {/* Simple, Clean & Strict Manual Dropdown Form Picker */}
            <ManualTimePicker
              value={plannedArrivalInput}
              onChange={setPlannedArrivalInput}
              disabled={creating}
            />

            {pendingRequests.length > 0 ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200">
                <span>You have <strong>{pendingRequests.length} vehicle registration request(s)</strong> ({pendingRequests.map(r => r.plateDisplay ?? r.plateNumber).join(', ')}) pending manager review.</span>
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
              onClick={() => setShowPricingModal(true)}
            >
              {creating
                ? 'Allocating spot...'
                : isSelectedVehicleParked
                  ? 'Vehicle already parked in building'
                  : `Reserve spot for ${selectedVehicle?.plateDisplay ?? selectedVehicle?.plateNumber ?? 'selected vehicle'}`}
            </Button>

            <QuotaNote quota={quota} />

            {/* Pricing & VNPay Deposit Confirmation Modal */}
            <BaseDialog open={showPricingModal} onOpenChange={setShowPricingModal}>
              <BaseDialogPopup from="top" className="sm:max-w-lg p-5">
                <BaseDialogHeader className="pb-3 border-b">
                  <div className="flex items-center justify-between">
                    <BaseDialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                      <FileText className="size-5 text-primary" />
                      Reservation Breakdown
                    </BaseDialogTitle>
                    <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-[11px]">
                      20% DISCOUNT
                    </Badge>
                  </div>
                  <BaseDialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Review your booking details, rate discount, and deposit rules before paying.
                  </BaseDialogDescription>
                </BaseDialogHeader>

                <div className="space-y-3.5 pt-3">
                  {/* Grid 1: Vehicle & Arrival Summary */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border bg-muted/20 p-3 space-y-0.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                        <span>Vehicle</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 font-semibold">{isCar ? 'Car' : 'Motorbike'}</Badge>
                      </div>
                      <p className="font-mono text-base font-black tracking-wider text-foreground">
                        {selectedVehicle?.plateDisplay ?? selectedVehicle?.plateNumber}
                      </p>
                    </div>

                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                        <Clock3 className="size-3" /> Planned Arrival
                      </p>
                      <p className="font-mono text-sm font-black text-primary">
                        {plannedArrivalInput ? formatDateTimeVN(plannedArrivalInput) : 'As Selected'}
                      </p>
                    </div>
                  </div>

                  {/* Card 2: Deposit & Pricing Breakdown */}
                  <div className="rounded-xl border bg-card p-3.5 space-y-2 text-xs shadow-xs">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-muted-foreground">Standard Walk-in Rate:</span>
                      <span className="font-mono font-semibold line-through text-muted-foreground">
                        {baseRate.toLocaleString('vi-VN')} VNĐ/h
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b pb-2">
                      <div>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 block">Pre-booked Hourly Rate (-20%):</span>
                        <span className="text-[10px] text-muted-foreground font-medium">★ Permanently locked for this session</span>
                      </div>
                      <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                        {discountedRate.toLocaleString('vi-VN')} VNĐ/h
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-0.5">
                      <div>
                        <span className="font-bold text-foreground block">Mandatory 1-Hour Deposit:</span>
                        <span className="text-[10px] text-muted-foreground">(Covers 1st hour at exit gate)</span>
                      </div>
                      <span className="font-mono text-lg font-black text-primary">
                        {depositAmount.toLocaleString('vi-VN')} VNĐ
                      </span>
                    </div>
                  </div>

                  {/* Card 3: Key Rules & Fee Example */}
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 text-xs text-amber-900 dark:text-amber-200">
                    <div className="flex items-center gap-1.5 font-bold">
                      <ShieldCheck className="size-4 text-amber-600 shrink-0" />
                      Reservation Rules & Checkout Examples:
                    </div>
                    <ul className="space-y-1 text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-tight">
                      <li>• <strong>15m Grace Period</strong>: Arrive within 15 mins of planned time or deposit is forfeited.</li>
                      <li>• <strong>1st Hour Covered</strong>: Stay ≤ 60 mins → <strong>0 VNĐ</strong> payable at exit gate.</li>
                      <li>• <strong>3h Stay Example</strong>: Pay <strong>{(2 * discountedRate).toLocaleString('vi-VN')} VNĐ</strong> at exit (2h × {discountedRate.toLocaleString('vi-VN')}đ).</li>
                    </ul>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t">
                    <Button type="button" variant="outline" className="min-h-10 text-xs font-semibold" onClick={() => setShowPricingModal(false)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={creating}
                      onClick={handleConfirmAndPay}
                      className="min-h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex-1 sm:flex-none"
                    >
                      <ShieldCheck className="mr-1.5 size-4" />
                      {creating ? 'Processing...' : `Pay ${depositAmount.toLocaleString('vi-VN')} VNĐ Deposit`}
                    </Button>
                  </div>
                </div>
              </BaseDialogPopup>
            </BaseDialog>
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
  const plate = (reservation.plateDisplay ?? rawPlate) || 'Vehicle unavailable'

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
          <p className="text-xs font-medium text-muted-foreground">
            PBMS Tower • Guaranteed Spot
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
function formatClock(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatCountdown(value: Date) {
  const remaining = Math.max(0, Math.ceil((value.getTime() - Date.now()) / 1000))
  return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
}


