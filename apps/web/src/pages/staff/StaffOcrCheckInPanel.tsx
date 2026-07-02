import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import {
  Bike,
  Camera,
  Car,
  CheckCircle2,
  Clock3,
  Edit3,
  HelpCircle,
  Keyboard,
  Loader2,
  Printer,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
} from 'lucide-react'
import { QRScanner } from '../../components/qr-scanner/QRScanner'

import { formatDateTimeVN } from '../../lib/date-time'
import { useToasts } from '../../lib/use-toasts'
import { RecentSessionsCard } from '../../components/ui/RecentSessionsCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  checkIn,
  issueSessionTicket,
  lookupPlate,
  recognizePlateImage,
  type AssignedSlot,
  type OcrRecognizeResponse,
  type SessionTicket,
  type VehicleLookupMode,
  type VehicleLookupResponse,
  type VehicleType,
  type Zone,
} from '../../lib/sessions-api'

type GateStatus =
  | 'CAMERA_READY'
  | 'CAPTURING'
  | 'OCR_PROCESSING'
  | 'OCR_SUCCESS'
  | 'OCR_FAILED'
  | 'REVIEW_REQUIRED'
  | 'CHECKING_IN'
  | 'CHECKIN_SUCCESS'
  | 'GENERATING_TICKET'
  | 'TICKET_READY'
  | 'PRINT_DIALOG_OPENED'
  | 'TICKET_ISSUED'
  | 'ERROR'

type CheckInServiceMode = 'walk-in' | 'reservation'
type PlateLookupStatus = 'idle' | 'loading' | 'success' | 'error'
type TicketStage = 'idle' | 'confirmed' | 'printed' | 'issued'

type Props = {
  toasts: ReturnType<typeof useToasts>
}

const BUILDING_NAME = import.meta.env.VITE_PBMS_BUILDING_NAME ?? 'PBMS Building'
const GATE_NAME = import.meta.env.VITE_PBMS_GATE_NAME ?? 'Main Gate'
const CAMERA_ID = import.meta.env.VITE_PLATE_RECOGNIZER_CAMERA_ID ?? 'staff-gate-camera'

export function StaffOcrCheckInPanel({ toasts }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ocrRequestIdRef = useRef(0)
  const lookupRequestIdRef = useRef(0)

  const [status, setStatus] = useState<GateStatus>('CAMERA_READY')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrRecognizeResponse | null>(null)
  const [plateLookup, setPlateLookup] = useState<VehicleLookupResponse | null>(null)
  const [plateLookupStatus, setPlateLookupStatus] = useState<PlateLookupStatus>('idle')
  const [plateLookupError, setPlateLookupError] = useState<string | null>(null)
  const [serviceMode, setServiceMode] = useState<CheckInServiceMode>('walk-in')
  const [reservationId, setReservationId] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('car')
  const [vehicleTypeOverride, setVehicleTypeOverride] = useState(false)
  const [ticket, setTicket] = useState<SessionTicket | null>(null)
  const [ticketStage, setTicketStage] = useState<TicketStage>('idle')
  const [issuedAt, setIssuedAt] = useState<string | null>(null)
  const [showReservationField, setShowReservationField] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [showReservationScanner, setShowReservationScanner] = useState(false)
  const [now, setNow] = useState(new Date())
  const [checkInCount, setCheckInCount] = useState(0)


  const reservationCode = reservationId.trim()
  const accessMode = plateLookup?.mode ?? 'WALK_IN'
  const hasLookupResult = plateLookupStatus === 'success' && Boolean(plateLookup)
  const canShowConfirm = hasLookupResult && Boolean(licensePlate.trim())
  const hasDraftData =
    Boolean(licensePlate.trim()) ||
    Boolean(reservationCode) ||
    Boolean(capturedImageUrl) ||
    Boolean(ocrResult) ||
    Boolean(plateLookup) ||
    Boolean(ticket)
  const checkInMode =
    serviceMode === 'reservation'
      ? 'Reservation check-in'
      : accessMode === 'SUBSCRIBER'
        ? 'Subscriber vehicle'
        : accessMode === 'REGISTERED'
          ? 'Registered vehicle'
          : 'Walk-in / no reservation'
  const canConfirm =
    Boolean(licensePlate.trim()) &&
    hasLookupResult &&
    (serviceMode === 'walk-in' || Boolean(reservationCode)) &&
    status !== 'OCR_PROCESSING' &&
    status !== 'CHECKING_IN'
  const canPrint = Boolean(ticket) && (status === 'TICKET_READY' || status === 'PRINT_DIALOG_OPENED')
  const canMarkIssued = Boolean(ticket) && ticketStage === 'printed'
  const canNextVehicle = Boolean(ticket) && ticketStage !== 'idle'

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setCameraError(null)
        setStatus((current) => (current === 'ERROR' ? 'CAMERA_READY' : current))
      } catch (error) {
        setCameraError(extractErrorMessage(error))
        setStatus('ERROR')
      }
    }

    startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (capturedImageUrl) {
        URL.revokeObjectURL(capturedImageUrl)
      }
    }
    // capturedImageUrl intentionally excluded; cleanup should run for the screen lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = useCallback(() => {
    setStatus('CAMERA_READY')
    setCapturedImageUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setOcrResult(null)
    setPlateLookup(null)
    setPlateLookupStatus('idle')
    setPlateLookupError(null)
    setServiceMode('walk-in')
    setReservationId('')
    setLicensePlate('')
    setVehicleType('car')
    setVehicleTypeOverride(false)
    setTicket(null)
    setTicketStage('idle')
    setIssuedAt(null)
    setShowReservationField(false)
    setResetDialogOpen(false)
    setShowReservationScanner(false)
  }, [])

  const requestReset = useCallback(() => {
    if (hasDraftData) {
      setResetDialogOpen(true)
      return
    }

    reset()
  }, [hasDraftData, reset])

  const handleReservationIdChange = useCallback((value: string) => {
    setReservationId(value)
    setServiceMode(value.trim() ? 'reservation' : 'walk-in')
  }, [])

  const handleLicensePlateChange = useCallback((value: string) => {
    setLicensePlate(value)
    setPlateLookup(null)
    setPlateLookupStatus('idle')
    setPlateLookupError(null)
    setVehicleTypeOverride(true)
  }, [])

  const lookupConfirmedPlate = useCallback(async (plate: string) => {
    const confirmedPlate = plate.trim().toUpperCase()
    if (!confirmedPlate) return

    const requestId = ++lookupRequestIdRef.current
    setPlateLookupStatus('loading')
    setPlateLookupError(null)

    try {
      const result = await lookupPlate(confirmedPlate)
      if (requestId !== lookupRequestIdRef.current) return

      setPlateLookup(result)
      setPlateLookupStatus('success')

      if (result.matched && result.vehicleType) {
        setVehicleType(result.vehicleType)
        setVehicleTypeOverride(false)
      } else {
        setVehicleTypeOverride(true)
      }
    } catch (error) {
      if (requestId !== lookupRequestIdRef.current) return
      setPlateLookup(null)
      setPlateLookupStatus('error')
      setPlateLookupError(extractErrorMessage(error))
      setVehicleTypeOverride(true)
    }
  }, [])

  const handleReservationQrScanned = useCallback((decodedText: string) => {
    const code = decodedText.trim()
    setShowReservationScanner(false)
    if (!code) {
      toasts.showError('Invalid reservation QR')
      return
    }

    setShowReservationField(true)
    setServiceMode('reservation')
    setReservationId(code)
    toasts.showSuccess('Reservation QR received')
  }, [toasts])

  const captureAndRecognize = useCallback(async () => {
    if (status === 'OCR_PROCESSING' || status === 'CHECKING_IN') return
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      toasts.showError('Camera is not ready yet')
      return
    }

    setStatus('CAPTURING')
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const context = canvas.getContext('2d')
    if (!context) {
      setStatus('ERROR')
      toasts.showError('Cannot capture camera frame')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.9)
    })

    if (!blob) {
      setStatus('ERROR')
      toasts.showError('Cannot prepare image for OCR')
      return
    }

    setCapturedImageUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(blob)
    })
    setOcrResult(null)
    setStatus('OCR_PROCESSING')

    const requestId = ++ocrRequestIdRef.current
    try {
      const response = await recognizePlateImage({
        image: blob,
        cameraId: CAMERA_ID,
        buildingName: BUILDING_NAME,
        gateName: GATE_NAME,
        reservationId: serviceMode === 'reservation' ? reservationCode || undefined : undefined,
      })
      if (requestId !== ocrRequestIdRef.current) return

      setOcrResult(response)
      if (response.detectedPlate) {
        setLicensePlate(response.detectedPlate)
        void lookupConfirmedPlate(response.detectedPlate)
        setStatus('OCR_SUCCESS')
        toasts.showSuccess(`Plate detected: ${response.detectedPlate}`)
      } else {
        setPlateLookup(null)
        setPlateLookupStatus('idle')
        setPlateLookupError(null)
        setVehicleTypeOverride(true)
        setStatus('OCR_FAILED')
        toasts.showError(response.error ?? 'No plate detected. Enter the plate manually.')
      }
    } catch (error) {
      if (requestId !== ocrRequestIdRef.current) return
      setOcrResult(null)
      setStatus('OCR_FAILED')
      toasts.showError(extractErrorMessage(error))
    }
  }, [lookupConfirmedPlate, reservationCode, serviceMode, status, toasts])

  const confirmCheckIn = useCallback(async () => {
    if (serviceMode === 'reservation' && !reservationCode) {
      setStatus('REVIEW_REQUIRED')
      toasts.showError('Please scan or enter the Reservation QR before reservation check-in')
      return
    }

    if (!licensePlate.trim()) {
      setStatus('REVIEW_REQUIRED')
      toasts.showError('Please confirm or enter a license plate before check-in')
      return
    }

    if (!hasLookupResult) {
      setStatus('REVIEW_REQUIRED')
      toasts.showError('Please lookup the plate before check-in')
      return
    }

    setStatus('CHECKING_IN')
    try {
      const response = await checkIn({
        licensePlate: licensePlate.trim().toUpperCase(),
        vehicleType,
        reservationId: serviceMode === 'reservation' ? reservationCode : undefined,
        ocrEvidenceId: ocrResult?.ocrEvidenceId,
        identificationMethod: serviceMode === 'reservation'
          ? 'RESERVATION_QR'
          : ocrResult?.ocrEvidenceId
            ? 'OCR'
            : 'MANUAL_PLATE',
        identificationConfidence: ocrResult?.confidence ?? undefined,
      })
      toasts.showSuccess(
        serviceMode === 'reservation'
          ? `Check-in successful. Reservation fulfilled. Slot ${response.slot.code} assigned.`
          : `Check-in successful. Slot ${response.slot.code} assigned. Ticket generated.`,
      )

      if (response.ticket) {
        setTicket(normalizeSessionTicket(response.ticket, response.slot))
        setTicketStage('confirmed')
        setCheckInCount((c) => c + 1)
        window.setTimeout(() => setStatus('TICKET_READY'), 250)
      } else {
        setCheckInCount((c) => c + 1)
        setStatus('CHECKIN_SUCCESS')
      }
    } catch (error) {
      setStatus('ERROR')
      toasts.showError(extractErrorMessage(error))
    }
  }, [hasLookupResult, licensePlate, ocrResult, reservationCode, serviceMode, toasts, vehicleType])

  const printTicket = useCallback(() => {
    if (!ticket) return
    setStatus('PRINT_DIALOG_OPENED')
    setTicketStage('printed')
    toasts.showSuccess('Ticket ready for printing.')
    window.print()
  }, [ticket, toasts])

  const markTicketIssued = useCallback(async () => {
    if (!ticket || ticketStage !== 'printed') return
    try {
      const response = await issueSessionTicket(ticket.sessionId)
      setIssuedAt(response.ticketIssuedAt)
      setTicketStage('issued')
      setStatus('TICKET_ISSUED')
      toasts.showSuccess('Ticket issued to driver')
    } catch (error) {
      toasts.showError(extractErrorMessage(error))
    }
  }, [ticket, ticketStage, toasts])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (event.key === 'Escape') {
        event.preventDefault()
        requestReset()
        return
      }

      if (isTyping) return

      if (event.code === 'Space') {
        event.preventDefault()
        void captureAndRecognize()
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        void confirmCheckIn()
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        if (canPrint) printTicket()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canPrint, captureAndRecognize, confirmCheckIn, printTicket, requestReset])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,0.5fr)]">
        <Card className="self-start border-primary/20 shadow-sm print:hidden">
          <CardHeader className="border-b bg-muted/30">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Camera className="size-4" />
                </span>
                Camera and OCR evidence
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <Keyboard className="size-3.5" />
                  Space capture
                </span>
                <span>Enter confirm</span>
                <span>Esc reset</span>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(15rem,0.65fr)] 2xl:grid-cols-[minmax(0,1.9fr)_minmax(17rem,0.7fr)]">
              <div className="relative aspect-video overflow-hidden rounded-xl border border-primary/20 bg-muted shadow-inner ring-1 ring-black/5">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  autoPlay
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 via-black/20 to-transparent" />
                <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-2 sm:inset-x-4 sm:top-4">
                  <div className="flex items-center gap-2 rounded-lg border border-white/80 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-950 shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-slate-950/90 dark:text-slate-50">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span>Live</span>
                    <span className="text-slate-500 dark:text-slate-400">/</span>
                    <span>{serviceMode === 'reservation' ? 'Reservation' : formatLookupMode(accessMode)}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="secondary" className="border border-white/80 bg-white/95 text-slate-950 shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-slate-950/90 dark:text-slate-50">
                      {vehicleType === 'car' ? 'Car' : 'Motorbike'}
                    </Badge>
                    <div className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/80 bg-white/95 px-2.5 text-xs font-semibold text-slate-700 shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-slate-950/90 dark:text-slate-300">
                      <Clock3 className="size-3.5" />
                      <span>{formatDateTimeVN(now)}</span>
                    </div>
                  </div>
                </div>
                {cameraError && (
                  <div className="absolute inset-0 grid place-items-center bg-background/95 p-6 text-center text-sm font-medium text-destructive">
                    {cameraError}
                  </div>
                )}
              </div>
              <EvidencePreview title="Captured OCR evidence" imageUrl={capturedImageUrl} />
            </div>

            {ticket ? (
              <Card className="border-l-4 border-l-primary bg-card shadow-sm print:mt-0 print:border-0 print:bg-white print:p-0">
                <CardHeader className="p-3 pb-0 print:hidden">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Ticket className="size-4 text-primary" />
                    {status === 'GENERATING_TICKET' ? 'Generating ticket...' : 'Session Ticket Preview'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <SessionTicketPreview ticket={ticket} issuedAt={issuedAt} />
                  <div className="mt-3 flex flex-col gap-2 print:hidden">
                    <Button
                      type="button"
                      onClick={printTicket}
                      disabled={ticketStage !== 'confirmed'}
                      className="h-11"
                    >
                      <Printer className="size-4" />
                      Print Ticket
                    </Button>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <Button
                        type="button"
                        onClick={markTicketIssued}
                        disabled={!canMarkIssued}
                        variant="outline"
                        className="h-11"
                      >
                        Mark Issued
                      </Button>
                      <Button
                        type="button"
                        onClick={reset}
                        disabled={!canNextVehicle}
                        variant="outline"
                        className="h-11"
                      >
                        Next Vehicle
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed bg-muted/30">
                <CardContent className="flex min-h-20 items-center justify-center p-4 text-center">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-primary">
                      <Ticket className="size-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">Ticket preview</p>
                      <p className="text-xs text-muted-foreground">
                        Confirm check-in to generate ticket and QR code.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
          </Card>

        <div className="space-y-4 print:hidden">
          <Card>
            <CardHeader className="grid-cols-[1fr_auto]">
              <div>
                <CardTitle>Service and actions</CardTitle>
                <CardDescription>{checkInMode}</CardDescription>
              </div>
              <CardAction>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="size-11">
                        <HelpCircle className="size-4" />
                        <span className="sr-only">Check-in help</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent align="end" className="max-w-64 text-xs">
                      Capture OCR or enter a plate, then lookup to auto-fill owner,
                      subscription, and vehicle type when the vehicle is registered.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Field
                  label="Confirmed license plate"
                  hint={
                    ocrResult
                      ? `OCR: ${ocrResult.detectedPlate || 'no plate detected'}${
                          ocrResult.confidence != null ? ` (${Math.round(ocrResult.confidence * 100)}%)` : ''
                        }`
                      : 'OCR: not run yet'
                  }
                >
                  <div className="flex gap-2">
                    <Input
                      className="h-11 font-mono text-sm font-semibold uppercase tracking-wide"
                      value={licensePlate}
                      onChange={(event) => handleLicensePlateChange(event.target.value)}
                      onBlur={() => {
                        if (licensePlate.trim()) void lookupConfirmedPlate(licensePlate)
                      }}
                      placeholder="VD: 59A-12345"
                    />
                    <Button
                      type="button"
                      onClick={() => lookupConfirmedPlate(licensePlate)}
                      disabled={!licensePlate.trim() || plateLookupStatus === 'loading'}
                      variant="outline"
                      className="h-11 shrink-0"
                    >
                      {plateLookupStatus === 'loading' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ScanLine className="size-4" />
                      )}
                      Lookup
                    </Button>
                  </div>
                </Field>

                {!showReservationField ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowReservationField(true)}
                    className="h-11 px-2 text-muted-foreground"
                  >
                    <QrCode className="size-4" />
                    Have reservation code?
                  </Button>
                ) : (
                  <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
                    <Field label="Reservation ID / QR" hint="Optional">
                      <div className="flex gap-2">
                        <Input
                          className="h-11 font-mono text-sm"
                          value={reservationId}
                          onChange={(event) => handleReservationIdChange(event.target.value)}
                          placeholder="Scan or paste UUID/code"
                        />
                        <Button
                          type="button"
                          onClick={() => setShowReservationScanner(true)}
                          variant="outline"
                          className="h-11 shrink-0"
                        >
                          <QrCode className="size-4" />
                          Scan
                        </Button>
                      </div>
                    </Field>
                  </div>
                )}

                {plateLookupStatus === 'error' && (
                  <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
                    {plateLookupError ?? 'Unable to lookup this plate.'}
                  </p>
                )}
              </div>

              {hasLookupResult && (
                <div className="animate-in space-y-4 fade-in-0 slide-in-from-top-1 duration-200">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <LookupModeBadge mode={accessMode} loading={false} />
                          {serviceMode === 'reservation' && (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              Reservation QR
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {getLookupSummary(plateLookup, plateLookupStatus)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getLookupDetail(plateLookup, plateLookupStatus, plateLookupError)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {plateLookup?.subscription?.isExpired && (
                    <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                      <ShieldCheck className="size-4" />
                      <AlertTitle>Subscription expired</AlertTitle>
                      <AlertDescription className="text-amber-800">
                        Plan {plateLookup.subscription.planType} expired on{' '}
                        {formatDateTimeVN(plateLookup.subscription.validTo)}.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Field label="Vehicle type">
                    {!vehicleTypeOverride && plateLookup?.matched && plateLookup.vehicleType ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky-950 text-white">
                            {vehicleType === 'car' ? <Car className="size-4" /> : <Bike className="size-4" />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold capitalize text-foreground">{vehicleType}</p>
                            <p className="truncate text-xs text-muted-foreground">Auto-filled from registered vehicle</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setVehicleTypeOverride(true)}
                          className="h-11 shrink-0"
                        >
                          <Edit3 className="size-3.5" />
                          Edit
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {(['car', 'motorbike'] as VehicleType[]).map((type) => (
                          <Button
                            key={type}
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setVehicleType(type)
                              setVehicleTypeOverride(true)
                            }}
                            className={cn(
                              'h-11 justify-center capitalize',
                              vehicleType === type &&
                                'border-sky-950 bg-sky-950 text-white hover:bg-sky-900 hover:text-white',
                            )}
                          >
                            {type === 'car' ? <Car className="size-4" /> : <Bike className="size-4" />}
                            {type}
                          </Button>
                        ))}
                      </div>
                    )}
                  </Field>
                </div>
              )}

              {canShowConfirm && (
                <div className="animate-in space-y-3 fade-in-0 slide-in-from-top-1 duration-200">
                  <Separator />
                  <Button
                    type="button"
                    onClick={confirmCheckIn}
                    disabled={!canConfirm}
                    className="h-11 w-full"
                  >
                    {status === 'CHECKING_IN' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    {status === 'CHECKING_IN'
                      ? 'Checking in...'
                      : serviceMode === 'reservation'
                        ? 'Confirm Reservation Check-in'
                        : 'Confirm Walk-in Check-in'}
                  </Button>
                </div>
              )}

              <div className="pt-2">
                <Button
                  type="button"
                  onClick={requestReset}
                  variant="outline"
                  className="h-11 w-full border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                >
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        <RecentSessionsCard type="checkin" refreshTrigger={checkInCount} />
      </div>
    </div>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset current check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              Current plate, lookup result, OCR evidence, and ticket draft will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={reset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showReservationScanner && (
        <QRScanner
          title="Scan Reservation QR"
          instructions="Scan the Reservation QR on the driver's mobile. QR payload is the reservation ID."
          manualToggleLabel="Cannot scan? Enter Reservation ID manually"
          manualInputLabel="Reservation ID / Code"
          manualInputPlaceholder="Reservation UUID/code"
          onScan={handleReservationQrScanned}
          onClose={() => setShowReservationScanner(false)}
          onManualInput={handleReservationQrScanned}
        />
      )}
    </div>
  )
}

function LookupModeBadge({
  mode,
  loading,
}: {
  mode: VehicleLookupMode
  loading?: boolean
}) {
  const Icon =
    mode === 'SUBSCRIBER' ? ShieldCheck : mode === 'REGISTERED' ? UserRound : Users

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-6 gap-1.5 px-2.5 font-semibold',
        loading && 'border-muted-foreground/20 bg-muted text-muted-foreground',
        !loading &&
          mode === 'SUBSCRIBER' &&
          'border-emerald-200 bg-emerald-50 text-emerald-700',
        !loading &&
          mode === 'REGISTERED' &&
          'border-sky-200 bg-sky-50 text-sky-700',
        !loading &&
          mode === 'WALK_IN' &&
          'border-slate-200 bg-slate-50 text-slate-700',
      )}
    >
      {loading ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
      {loading ? 'Looking up' : formatLookupMode(mode)}
    </Badge>
  )
}

function getLookupSummary(
  lookup: VehicleLookupResponse | null,
  status: PlateLookupStatus,
) {
  if (status === 'loading') return 'Checking registered vehicle data...'
  if (!lookup) return 'Capture OCR or enter a plate to identify the vehicle.'
  if (!lookup.matched) return 'No registered vehicle found.'

  const ownerName = lookup.ownerName || lookup.owner?.phone || 'Registered customer'
  if (lookup.mode === 'SUBSCRIBER') return `${ownerName} - Subscriber`
  return `${ownerName} - Registered vehicle`
}

function getLookupDetail(
  lookup: VehicleLookupResponse | null,
  status: PlateLookupStatus,
  error: string | null,
) {
  if (status === 'error') return error ?? 'Unable to lookup this plate.'
  if (status === 'loading') return 'Owner, linked drivers, subscription, and vehicle type are being loaded.'
  if (!lookup) return 'Matched vehicles will auto-fill owner, subscription, and vehicle type.'
  if (!lookup.matched) return 'Staff must confirm vehicle type manually before check-in.'

  const linked = lookup.driverCount === 1 ? '1 linked user' : `${lookup.driverCount} linked users`
  const subscription = lookup.subscription
    ? `${lookup.subscription.planType}${lookup.subscription.isExpired ? ' expired' : ' active'}`
    : 'no subscription'
  return `${linked} - ${subscription}`
}

function formatLookupMode(mode: VehicleLookupMode) {
  if (mode === 'SUBSCRIBER') return 'Subscriber'
  if (mode === 'REGISTERED') return 'Registered'
  return 'Walk-in'
}

function EvidencePreview({ title, imageUrl }: { title: string; imageUrl: string | null }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col rounded-xl border bg-card p-2.5 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <ScanLine className="size-3.5 text-primary" />
        <span className="truncate">{title}</span>
      </div>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Captured OCR evidence"
          className="min-h-0 w-full flex-1 rounded-lg border object-cover"
        />
      ) : (
        <div className="grid min-h-[120px] flex-1 place-items-center rounded-lg border border-dashed bg-muted/40 p-3 text-center text-xs text-muted-foreground">
          <div className="space-y-1">
            <ScanLine className="mx-auto size-5 text-primary/70" />
            <p>Press Space to capture plate</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between gap-3">
        <Label className="text-xs font-semibold text-foreground">{label}</Label>
        {hint ? (
          <span className="truncate text-[11px] font-medium text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      {children}
    </label>
  )
}

function normalizeSessionTicket(ticket: SessionTicket, slot: AssignedSlot): SessionTicket {
  const derived = deriveLocationFromSlotCode(ticket.slotCode || slot.code)

  return {
    ...ticket,
    slotCode: ticket.slotCode || slot.code,
    floorName: ticket.floorName || slot.floor?.name || derived.floorName,
    floorNumber: ticket.floorNumber ?? slot.floor?.floorNumber ?? derived.floorNumber,
    zone: ticket.zone || slot.zone || derived.zone,
  }
}

function deriveLocationFromSlotCode(slotCode: string): {
  floorName?: string
  floorNumber?: number
  zone?: Zone
} {
  const match = slotCode.match(/^([A-Z]+\d+)-([A-Z])-/i)
  if (!match) return {}

  const floorName = match[1].toUpperCase()
  const floorNumberMatch = floorName.match(/\d+/)
  const zone = match[2].toUpperCase()

  return {
    floorName,
    floorNumber: floorNumberMatch ? Number(floorNumberMatch[0]) : undefined,
    zone: zone === 'A' || zone === 'B' ? zone : undefined,
  }
}

function SessionTicketPreview({ ticket, issuedAt }: { ticket: SessionTicket; issuedAt: string | null }) {
  const derivedLocation = deriveLocationFromSlotCode(ticket.slotCode)
  const floorDisplay = ticket.floorName || derivedLocation.floorName || '-'
  const zoneDisplay = ticket.zone || derivedLocation.zone || '-'
  const toasts = useToasts()

  const copySessionCode = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ticket.sessionCode)
      } else {
        copyTextFallback(ticket.sessionCode)
      }
      toasts.showSuccess('Session code copied')
    } catch {
      toasts.showError('Unable to copy session code')
    }
  }, [ticket.sessionCode, toasts])

  return (
    <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-white p-3 text-xs shadow-sm print:mx-auto print:mt-0 print:w-[80mm] print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="text-center hidden print:block">
        <p className="text-lg font-black tracking-wider text-gray-950 print:text-base">PBMS PARKING TICKET</p>
        <p className="text-[10px] text-gray-400">Keep this ticket for checkout</p>
      </div>

      <div className="mt-1 flex flex-col items-center justify-center gap-1 print:mt-3">
        <div className="rounded border border-slate-800 bg-slate-50 px-3 py-1 text-center font-mono text-base font-bold tracking-widest text-slate-900 shadow-sm">
          {ticket.licensePlate}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 hidden print:inline-block">
          {ticket.vehicleType}
        </span>
      </div>

      <div className="my-2 border-t border-dashed border-gray-200 hidden print:block print:my-3" />

      {ticket.qrCode && (
        <img
          src={ticket.qrCode}
          alt="Session QR"
          className="mx-auto my-3 h-48 w-48 rounded-xl border border-gray-200 bg-white p-3 print:my-2 print:h-40 print:w-40 print:p-2"
        />
      )}

      <button
        type="button"
        onClick={copySessionCode}
        className="mx-auto -mt-1 mb-2 flex max-w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-center font-mono text-[11px] font-bold tracking-wider text-slate-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 print:hidden"
        title="Copy session code"
      >
        {ticket.sessionCode}
      </button>

      <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-center hidden print:block print:mt-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Session Code</p>
        <p className="font-mono text-sm font-bold text-slate-800">{ticket.sessionCode}</p>
      </div>

      <div className="my-2 border-t border-dashed border-gray-200 hidden print:block print:my-3" />

      <section className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-2.5 print:p-3 mt-2">
        <p className="text-center text-[9px] font-extrabold uppercase tracking-[0.15em] text-emerald-800">
          Assigned space
        </p>
        <div className="mt-1.5 grid grid-cols-1 gap-1 text-center print:mt-2 print:grid-cols-3">
          <div>
            <p className="text-[9px] font-bold uppercase text-emerald-600">Slot</p>
            <p className="font-mono text-xs font-bold text-emerald-950">{ticket.slotCode}</p>
          </div>
          <div className="hidden print:block">
            <p className="text-[9px] font-bold uppercase text-emerald-600">Floor</p>
            <p className="text-sm font-black text-emerald-950">{floorDisplay}</p>
          </div>
          <div className="hidden print:block">
            <p className="text-[9px] font-bold uppercase text-emerald-600">Zone</p>
            <p className="text-sm font-black text-emerald-950">{zoneDisplay}</p>
          </div>
        </div>
      </section>

      <div className="mt-3 space-y-1 text-xs border-t border-dashed border-gray-200 pt-2 hidden print:block print:mt-4 print:pt-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Check-in:</span>
          <span className="font-medium text-gray-800">{formatDateTimeVN(ticket.checkInTime)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Location:</span>
          <span className="font-medium text-gray-800">{ticket.gateName} ({ticket.buildingName})</span>
        </div>
      </div>

      {issuedAt && (
        <p className="mt-2.5 rounded bg-emerald-50/50 p-2 text-center text-[11px] font-bold text-emerald-700 print:mt-3">
          Issued at {formatDateTimeVN(issuedAt)}
        </p>
      )}
    </div>
  )
}

function copyTextFallback(value: string) {
  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.left = '-9999px'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
}

function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const raw = error.response?.data?.message
    if (Array.isArray(raw)) return raw.join(', ')
    if (typeof raw === 'string') return raw
    return `Request failed (${error.response?.status ?? 'network'})`
  }
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}
