import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import {
  Camera,
  CheckCircle2,
  Clock3,
  CornerDownLeft,
  Eye,
  Keyboard,
  Loader2,
  Printer,
  QrCode,
  RotateCcw,
  ScanLine,
  Ticket,
  UserCheck,
  X,
} from 'lucide-react'

import { formatDateTimeVN } from '../../lib/date-time'
import { normalizePlateForApi, isValidVietnamesePlate } from '../../lib/plate-format'
import { useToasts } from '../../lib/use-toasts'
import { RecentSessionsCard } from '../../components/ui/RecentSessionsCard'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  checkIn,
  type CheckoutEvidence,
  type CheckoutWorkflowResponse,
  type GateCheckoutSubMode,
  issueSessionTicket,
  resolveGatePlate,
  scanGatePlate,
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

type PlateLookupStatus = 'idle' | 'loading' | 'success' | 'error'
type TicketStage = 'idle' | 'confirmed' | 'printed' | 'issued'

type Props = {
  onRouteToCheckout?: (input: {
    checkout: CheckoutWorkflowResponse
    plateConfirmed: string
    subMode: GateCheckoutSubMode
    exitEvidence?: CheckoutEvidence | null
  }) => void
  onSwitchToReservationQr?: () => void
  toasts: ReturnType<typeof useToasts>
  laneVehicleType?: VehicleType
}

const BUILDING_NAME = import.meta.env.VITE_PBMS_BUILDING_NAME ?? 'PBMS Building'
const GATE_NAME = import.meta.env.VITE_PBMS_GATE_NAME ?? 'Main Gate'
const CAMERA_ID = import.meta.env.VITE_PLATE_RECOGNIZER_CAMERA_ID ?? 'staff-gate-camera'

export function StaffOcrCheckInPanel({
  onRouteToCheckout,
  onSwitchToReservationQr,
  toasts,
  laneVehicleType = 'car',
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ocrRequestIdRef = useRef(0)
  const lookupRequestIdRef = useRef(0)

  const [status, setStatus] = useState<GateStatus>('CAMERA_READY')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null)
  const [ocrResult, setOcrResult] = useState<OcrRecognizeResponse | null>(null)
  const [ocrFailureCount, setOcrFailureCount] = useState(0)
  const [plateLookup, setPlateLookup] = useState<VehicleLookupResponse | null>(null)
  const [plateLookupStatus, setPlateLookupStatus] = useState<PlateLookupStatus>('idle')
  const [plateLookupError, setPlateLookupError] = useState<string | null>(null)
  const [licensePlate, setLicensePlate] = useState('')
  const [manualPlateMode, setManualPlateMode] = useState(false)
  const [dialogManualMode, setDialogManualMode] = useState(false)
  const [dialogManualPlate, setDialogManualPlate] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('car')
  const [ticket, setTicket] = useState<SessionTicket | null>(null)
  const [ticketStage, setTicketStage] = useState<TicketStage>('idle')
  const [issuedAt, setIssuedAt] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [skipDialogOpen, setSkipDialogOpen] = useState(false)
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [now, setNow] = useState(new Date())
  const [checkInCount, setCheckInCount] = useState(0)

  useEffect(() => {
    setVehicleType(laneVehicleType)
  }, [laneVehicleType])


  const accessMode = plateLookup?.mode ?? 'WALK_IN'
  const hasLookupResult = plateLookupStatus === 'success' && Boolean(plateLookup)
  const hasDraftData =
    Boolean(licensePlate.trim()) ||
    Boolean(capturedImageUrl) ||
    Boolean(ocrResult) ||
    Boolean(plateLookup) ||
    Boolean(manualPlateMode) ||
    Boolean(ticket)
  const canConfirm =
    Boolean(licensePlate.trim()) &&
    (hasLookupResult || status === 'REVIEW_REQUIRED') &&
    status !== 'OCR_PROCESSING' &&
    status !== 'CHECKING_IN'
  const canPrint = Boolean(ticket) && ticketStage === 'confirmed'
  const canReprint = Boolean(ticket) && (ticketStage === 'printed' || ticketStage === 'issued')
  const canMarkIssued = Boolean(ticket) && ticketStage === 'printed'
  const canNextVehicle = Boolean(ticket)
  const scanLocked = Boolean(ticket) || status === 'OCR_PROCESSING' || status === 'CHECKING_IN'

  const restartCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setCameraError(null)
      setStatus((current) => {
        if (current === 'CHECKIN_SUCCESS' || current === 'TICKET_READY' || current === 'TICKET_ISSUED' || current === 'PRINT_DIALOG_OPENED') {
          return current
        }
        return 'CAMERA_READY'
      })
    } catch (error) {
      setCameraError(extractErrorMessage(error))
      setStatus('ERROR')
    }
  }, [])

  useEffect(() => {
    if (ticket) {
      setReviewDialogOpen(false)
      return
    }

    if (hasLookupResult || status === 'REVIEW_REQUIRED') {
      setReviewDialogOpen(true)
    }
  }, [hasLookupResult, status, ticket])

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
    setOcrFailureCount(0)
    setPlateLookup(null)
    setPlateLookupStatus('idle')
    setPlateLookupError(null)
    setLicensePlate('')
    setManualPlateMode(false)
    setVehicleType('car')
    setTicket(null)
    setTicketStage('idle')
    setIssuedAt(null)
    setTicketStage('idle')
    setIssuedAt(null)
    setResetDialogOpen(false)
    setSkipDialogOpen(false)
    setTicketDialogOpen(false)
    setReviewDialogOpen(false)
    // Restart camera
    async function restartCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setCameraError(null)
      } catch (error) {
        setCameraError(extractErrorMessage(error))
      }
    }
    void restartCamera()
  }, [])

  const requestReset = useCallback(() => {
    if (hasDraftData) {
      setResetDialogOpen(true)
      return
    }

    reset()
  }, [hasDraftData, reset])

  const handleLicensePlateChange = useCallback((value: string) => {
    setLicensePlate(value)
    setPlateLookup(null)
    setPlateLookupStatus('idle')
    setPlateLookupError(null)
  }, [])

  const applyCheckInLookup = useCallback((plate: string, lookup: VehicleLookupResponse) => {
    setLicensePlate(plate)
    setPlateLookup(lookup)
    setPlateLookupStatus('success')
    setPlateLookupError(null)

    if (lookup.matched && lookup.vehicleType) {
      setVehicleType(lookup.vehicleType)
    }
  }, [])

  const lookupConfirmedPlate = useCallback(async (plate: string) => {
    const confirmedPlate = normalizePlateForApi(plate)
    if (!confirmedPlate) return

    const requestId = ++lookupRequestIdRef.current
    setPlateLookupStatus('loading')
    setPlateLookupError(null)

    try {
      const result = await resolveGatePlate({
        plate: confirmedPlate,
        ocrEvidenceId: ocrResult?.ocrEvidenceId,
      })
      if (requestId !== lookupRequestIdRef.current) return

      if (result.mode === 'CHECK_OUT') {
        const exitEvidence = buildExitEvidenceFromOcr({
          ocrEvidenceId: ocrResult?.ocrEvidenceId,
          plate: result.plateOcr ?? result.plateConfirmed,
          confidence: result.confidence ?? ocrResult?.confidence ?? null,
          localImageUrl: capturedImageUrl,
        })
        onRouteToCheckout?.({
          checkout: {
            ...result.checkout,
            exitEvidence,
          },
          plateConfirmed: result.plateDisplay ?? result.plateConfirmed,
          subMode: result.subMode,
          exitEvidence,
        })
        return
      }

      applyCheckInLookup(result.plateDisplay ?? result.plateConfirmed, result.lookup)
    } catch (error) {
      if (requestId !== lookupRequestIdRef.current) return
      setPlateLookup(null)
      setPlateLookupStatus('error')
      setPlateLookupError(extractErrorMessage(error))
    }
  }, [applyCheckInLookup, capturedImageUrl, ocrResult?.confidence, ocrResult?.ocrEvidenceId, onRouteToCheckout])

  const captureAndRecognize = useCallback(async () => {
    if (scanLocked) return
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      toasts.showError('Camera is not ready yet')
      return
    }

    setStatus('CAPTURING')
    // Downscale to max 1280px width (keeps aspect ratio) — full camera
    // resolution (1080p/4K) produces 2-5MB JPEGs, far above Plate
    // Recognizer Cloud's 3MB limit and slower to upload without any
    // accuracy gain for plate reading.
    const MAX_CAPTURE_WIDTH = 1280
    const sourceWidth = video.videoWidth || MAX_CAPTURE_WIDTH
    const sourceHeight = video.videoHeight || 720
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / sourceWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sourceWidth * scale)
    canvas.height = Math.round(sourceHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) {
      setStatus('ERROR')
      toasts.showError('Cannot capture camera frame')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.8)
    })

    if (!blob) {
      setStatus('ERROR')
      toasts.showError('Cannot prepare image for OCR')
      return
    }

    const capturedUrl = URL.createObjectURL(blob)
    setCapturedImageUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return capturedUrl
    })
    // Stop camera after capturing
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setOcrResult(null)
    setStatus('OCR_PROCESSING')

    const requestId = ++ocrRequestIdRef.current
    try {
      const response = await scanGatePlate({
        image: blob,
        cameraId: CAMERA_ID,
        buildingName: BUILDING_NAME,
        gateName: GATE_NAME,
      })
      if (requestId !== ocrRequestIdRef.current) return

      const nextOcrResult: OcrRecognizeResponse = {
        ocrEvidenceId: response.ocrEvidenceId ?? '',
        detectedPlate:
          response.mode === 'NEEDS_MANUAL_PLATE'
            ? null
            : response.plateDisplay ?? response.plateConfirmed,
        rawPlate: null,
        canonicalPlate: response.mode === 'NEEDS_MANUAL_PLATE' ? null : response.plateConfirmed,
        displayPlate: response.mode === 'NEEDS_MANUAL_PLATE' ? null : response.plateDisplay,
        confidence: response.mode === 'NEEDS_MANUAL_PLATE' ? null : response.confidence ?? null,
        vehicleTypePrediction: null,
        provider: 'PLATE_RECOGNIZER',
        providerFilename: null,
        providerTimestamp: null,
        cameraId: CAMERA_ID,
        plateBox: null,
        buildingName: BUILDING_NAME,
        gateName: GATE_NAME,
        error: response.mode === 'NEEDS_MANUAL_PLATE' ? response.error ?? 'No plate detected' : null,
        imageUrl: null,
        thumbnailUrl: null,
        imageMimeType: null,
        imageSizeBytes: null,
        durationMs: 0,
      }
      setOcrResult(nextOcrResult)

      if (response.mode === 'CHECK_OUT') {
        setOcrFailureCount(0)
        const exitEvidence = buildExitEvidenceFromOcr({
          ocrEvidenceId: response.ocrEvidenceId,
          plate: response.plateOcr ?? response.plateConfirmed,
          confidence: response.confidence ?? null,
          localImageUrl: capturedUrl,
        })
        setStatus('OCR_SUCCESS')
        toasts.showInfo(
          `Open session found for ${response.plateDisplay ?? response.plateConfirmed}. Continue checkout.`,
        )
        onRouteToCheckout?.({
          checkout: {
            ...response.checkout,
            exitEvidence,
          },
          plateConfirmed: response.plateDisplay ?? response.plateConfirmed,
          subMode: response.subMode,
          exitEvidence,
        })
        return
      }

       if (response.mode === 'CHECK_IN') {
        setOcrFailureCount(0)
        applyCheckInLookup(response.plateDisplay ?? response.plateConfirmed, response.lookup)
        setStatus('OCR_SUCCESS')
        toasts.showSuccess(`Plate detected: ${response.plateDisplay ?? response.plateConfirmed}`)
      } else {
        // OCR failed → show inline manual plate entry (rain/mud case)
        setOcrFailureCount(0)
        setPlateLookup(null)
        setPlateLookupStatus('idle')
        setPlateLookupError(null)
        setManualPlateMode(true)
        toasts.showError('Could not read the plate. Type the plate below to check in directly.')
      }
    } catch (error) {
      if (requestId !== ocrRequestIdRef.current) return
      setOcrResult(null)
      setStatus('OCR_FAILED')
      toasts.showError(extractErrorMessage(error))
    } finally {
      // FIX: Restart camera after OCR completes so staff can scan again
      await restartCamera()
    }
  }, [applyCheckInLookup, ocrFailureCount, onRouteToCheckout, restartCamera, scanLocked, toasts])

  const confirmCheckIn = useCallback(async () => {
    if (!licensePlate.trim()) {
      setStatus('REVIEW_REQUIRED')
      toasts.showError('Please confirm or enter a license plate before check-in')
      return
    }

    if (!hasLookupResult && !manualPlateMode) {
      setStatus('REVIEW_REQUIRED')
      toasts.showError('Please lookup the plate or enter it manually')
      return
    }

    setStatus('CHECKING_IN')

    try {
      const response = await checkIn({
        licensePlate: normalizePlateForApi(licensePlate),
        vehicleType: laneVehicleType,
        ocrEvidenceId: ocrResult?.ocrEvidenceId,
        identificationMethod: ocrResult?.ocrEvidenceId ? 'OCR' : 'MANUAL_PLATE',
        identificationConfidence: ocrResult?.confidence ?? undefined,
      })
      toasts.showSuccess(`Check-in successful. Slot ${response.slot.code} assigned. Ticket generated.`)

      if (response.ticket) {
        setTicket(normalizeSessionTicket(response.ticket, response.slot))
        setTicketStage('confirmed')
        setOcrFailureCount(0)
        setManualPlateMode(false)
        setCheckInCount((c) => c + 1)
        window.setTimeout(() => setStatus('TICKET_READY'), 250)
      } else {
        setOcrFailureCount(0)
        setManualPlateMode(false)
        setCheckInCount((c) => c + 1)
        setStatus('CHECKIN_SUCCESS')
      }
      setReviewDialogOpen(false)
    } catch (error) {
      setStatus('ERROR')
      toasts.showError(extractErrorMessage(error))
    }
  }, [hasLookupResult, manualPlateMode, laneVehicleType, licensePlate, ocrResult, toasts])

  const printTicket = useCallback(() => {
    if (!ticket) return
    setStatus('PRINT_DIALOG_OPENED')
    if (ticketStage === 'confirmed') {
      setTicketStage('printed')
    }
    toasts.showSuccess('Ticket ready for printing.')
    window.print()
  }, [ticket, ticketStage, toasts])

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

  const skipTicket = useCallback(() => {
    setSkipDialogOpen(false)
    reset()
  }, [reset])

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

      if (event.code === 'Space' && !reviewDialogOpen && !ticket) {
        event.preventDefault()
        void captureAndRecognize()
      }
      if (event.key === 'Enter' && reviewDialogOpen && canConfirm) {
        event.preventDefault()
        void confirmCheckIn()
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        if (canPrint || canReprint) printTicket()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canConfirm, canPrint, canReprint, captureAndRecognize, confirmCheckIn, printTicket, requestReset, reviewDialogOpen, ticket])

  return (
    <div className="space-y-4">
      <div className={ticket ? 'grid gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(300px,0.6fr)]' : 'grid gap-4'}>
        <Card className="self-start border-primary/20 shadow-sm print:hidden">
          <CardHeader className="border-b bg-muted/30">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Camera className="size-4" />
                </span>
                Scan Plate
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                        <Keyboard className="size-3.5" />
                        Shortcuts
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p><kbd className="font-mono font-bold">Space</kbd> Capture &amp; OCR</p>
                      <p><kbd className="font-mono font-bold">Esc</kbd> Reset</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  <span>{formatLookupMode(accessMode)}</span>
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

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                onClick={() => void captureAndRecognize()}
                disabled={scanLocked}
                className="h-11 sm:min-w-[180px]"
              >
                {status === 'OCR_PROCESSING' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ScanLine className="size-4" />
                )}
                {status === 'OCR_PROCESSING'
                  ? 'Scanning plate...'
                  : ocrFailureCount > 0
                    ? 'Scan again'
                    : 'Scan Plate'}
              </Button>
              {onSwitchToReservationQr ? (
                <Button
                  type="button"
                  onClick={onSwitchToReservationQr}
                  variant="outline"
                  disabled={Boolean(ticket)}
                  className="h-11 sm:min-w-[200px]"
                >
                  <QrCode className="size-4" />
                  Scan QR Pass
                </Button>
              ) : null}
              {status === 'OCR_FAILED' ? (
                <Alert className="min-h-11 flex-1 py-2">
                  <AlertDescription className="text-xs">
                    Align the vehicle or camera, then scan again.
                  </AlertDescription>
                </Alert>
              ) : null}
              {manualPlateMode ? (
                <ManualPlateInlineEntry
                  capturedImageUrl={capturedImageUrl}
                  licensePlate={licensePlate}
                  onPlateChange={handleLicensePlateChange}
                  onConfirm={() => void confirmCheckIn()}
                  onCancel={() => {
                    setManualPlateMode(false)
                    setLicensePlate('')
                    setPlateLookup(null)
                    setPlateLookupStatus('idle')
                    setPlateLookupError(null)
                    setStatus('CAMERA_READY')
                  }}
                  isLoading={status === 'CHECKING_IN'}
                  laneVehicleType={laneVehicleType}
                />
              ) : null}
              {capturedImageUrl && (
                <div className="ml-auto hidden sm:flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
                  <img
                    src={capturedImageUrl}
                    alt="OCR capture"
                    className="h-9 w-14 rounded border object-cover"
                  />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {ocrResult?.confidence != null
                      ? `${Math.round(ocrResult.confidence * 100)}%`
                      : 'Captured'}
                  </span>
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        {ticket ? (
          <aside className="print:hidden">
          <Card>
            <CardHeader className="grid-cols-[1fr_auto]">
              <div>
                <CardTitle>Ticket ready</CardTitle>
                <CardDescription>{ticket.sessionCode}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Ticket className="size-4" />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-mono text-sm font-black tracking-wide text-foreground">
                          {ticket.sessionCode}
                        </p>
                        <p className="truncate text-sm font-semibold text-foreground">
                          {ticket.plateDisplay ?? ticket.licensePlate}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground">Slot {ticket.slotCode}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {ticketStage === 'confirmed' ? (
                      <Button type="button" onClick={printTicket} disabled={!canPrint} className="h-11 w-full">
                        <Printer className="size-4" />
                        Print Ticket
                      </Button>
                    ) : null}
                    {ticketStage === 'printed' ? (
                      <Button type="button" onClick={markTicketIssued} disabled={!canMarkIssued} className="h-11 w-full">
                        <Ticket className="size-4" />
                        Mark Issued
                      </Button>
                    ) : null}
                    {ticketStage === 'issued' ? (
                      <Button type="button" onClick={reset} disabled={!canNextVehicle} className="h-11 w-full">
                        <RotateCcw className="size-4" />
                        Next Vehicle
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTicketDialogOpen(true)}
                      className="h-11 w-full"
                    >
                      <Eye className="size-4" />
                      View ticket
                    </Button>
                    {canReprint ? (
                      <Button type="button" onClick={printTicket} variant="outline" className="h-11 w-full">
                        <Printer className="size-4" />
                        Reprint Ticket
                      </Button>
                    ) : null}
                    {ticketStage !== 'issued' ? (
                      <Button
                        type="button"
                        onClick={() => setSkipDialogOpen(true)}
                        variant="ghost"
                        className="h-11 w-full text-destructive hover:bg-destructive/5 hover:text-destructive"
                      >
                        <RotateCcw className="size-4" />
                        Skip ticket &amp; next vehicle
                      </Button>
                    ) : null}
                  </div>
                  </div>
            </CardContent>
          </Card>
          </aside>
        ) : null}
      </div>

      <RecentSessionsCard type="checkin" limit={3} refreshTrigger={checkInCount} />

      {ticket ? (
        <>
          <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-24px)] max-w-md overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ticket ready</DialogTitle>
                <DialogDescription>{ticket.sessionCode}</DialogDescription>
              </DialogHeader>
              <SessionTicketPreview ticket={ticket} issuedAt={issuedAt} />
            </DialogContent>
          </Dialog>

          <div id="receipt" className="hidden print:block">
            <SessionTicketPreview ticket={ticket} issuedAt={issuedAt} />
          </div>
        </>
      ) : null}

      <Dialog
        open={reviewDialogOpen}
        onOpenChange={(open) => {
          if (open) setReviewDialogOpen(true)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-24px)] max-w-3xl gap-0 overflow-y-auto p-0 sm:max-w-3xl"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            requestReset()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canConfirm && (status as string) !== 'CHECKING_IN') {
              event.preventDefault()
              void confirmCheckIn()
            }
          }}
        >
          <DialogHeader className="border-b px-6 py-4 sm:px-7">
            <DialogTitle>Confirm check-in</DialogTitle>
            <DialogDescription className="sr-only">
              Review the captured vehicle plate before assigning a slot.
            </DialogDescription>
          </DialogHeader>

          {hasLookupResult ? (
            <div className="grid gap-6 px-6 py-6 sm:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] sm:px-7">
              {capturedImageUrl ? (
                <img
                  src={capturedImageUrl}
                  alt="Captured vehicle plate"
                  className="aspect-video h-full w-full rounded-xl border bg-muted object-contain shadow-sm"
                />
              ) : (
                <div className="grid aspect-video place-items-center rounded-xl border border-dashed bg-muted/30 text-muted-foreground">
                  <Camera className="size-7" />
                </div>
              )}
              <div className="flex min-w-0 flex-col justify-center gap-4">
                 {dialogManualMode ? (
                   <div className="space-y-2">
                     <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Manual plate entry</p>
                     <div className="flex gap-2">
                       <input
                         type="text"
                         value={dialogManualPlate}
                         onChange={(e) => setDialogManualPlate(e.target.value.toUpperCase())}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && dialogManualPlate.trim()) {
                             setLicensePlate(normalizePlateForApi(dialogManualPlate))
                             void lookupConfirmedPlate(normalizePlateForApi(dialogManualPlate))
                             setDialogManualMode(false)
                           }
                         }}
                         placeholder={vehicleType === 'car' ? '59A-12345' : '59A1-12345'}
                         className="h-11 flex-1 rounded-lg border border-amber-200 bg-white px-3 font-mono font-black uppercase tracking-wide placeholder:text-amber-300 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100 dark:placeholder:text-amber-700/50"
                         autoFocus
                         autoComplete="off"
                         autoCorrect="off"
                         spellCheck={false}
                       />
                       <Button
                         type="button"
                         variant="outline"
                         onClick={() => {
                           if (dialogManualPlate.trim()) {
                             setLicensePlate(normalizePlateForApi(dialogManualPlate))
                             void lookupConfirmedPlate(normalizePlateForApi(dialogManualPlate))
                             setDialogManualMode(false)
                           }
                         }}
                         disabled={!dialogManualPlate.trim()}
                         className="h-11"
                       >
                         Update
                       </Button>
                     </div>
                   </div>
                 ) : (
                   <div className="space-y-1.5">
                     <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Captured plate</p>
                     <p className="break-all font-mono text-3xl font-black tracking-wide text-foreground sm:text-4xl">
                       {licensePlate}
                     </p>
                     {!isValidVietnamesePlate(licensePlate) && licensePlate && (
                       <p className="text-xs text-destructive">
                         Invalid plate format. Expected: XX-XXX.XX (car) or XX-X-XXXX.XX (motorcycle).
                       </p>
                     )}
                   </div>
                 )}

                {/* Active Reservation Match Banner */}
                {plateLookup?.activeReservation ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/80 p-3 text-xs dark:bg-emerald-950/40">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>Active Reservation Matched (20% OFF)</span>
                    </div>
                    <p className="mt-1 font-medium text-emerald-900 dark:text-emerald-100">
                      Assigned Spot: <strong className="font-bold text-sm text-emerald-950 dark:text-emerald-50">{plateLookup.activeReservation.slotCode}</strong> ({plateLookup.activeReservation.floorName})
                    </p>
                    {plateLookup.owner?.fullName && (
                      <p className="mt-0.5 text-[11px] text-emerald-800/90 dark:text-emerald-300/90">
                        Driver: {plateLookup.owner.fullName} {plateLookup.owner.phone ? `(${plateLookup.owner.phone})` : ''}
                      </p>
                    )}
                  </div>
                ) : plateLookup?.matched && plateLookup?.owner ? (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-50/80 p-3 text-xs dark:bg-blue-950/40">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold">
                      <UserCheck className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
                      <span>Registered Vehicle Owner</span>
                    </div>
                    <p className="mt-1 font-medium text-blue-900 dark:text-blue-100">
                      {plateLookup.owner.fullName} {plateLookup.owner.phone ? `(${plateLookup.owner.phone})` : ''}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs dark:bg-slate-800/50">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Walk-in Guest</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Auto slot allocation will select the best available spot.</p>
                  </div>
                )}

                <Button
                  type="button"
                  autoFocus
                  onClick={confirmCheckIn}
                  disabled={!canConfirm}
                  className="h-12 w-full text-base gap-2"
                >
                  {(status as string) === 'CHECKING_IN' ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
                  <span>{(status as string) === 'CHECKING_IN' ? 'Checking in...' : 'Confirm Check-in'}</span>
                  {(status as string) !== 'CHECKING_IN' && (
                    <kbd className="ml-2 inline-flex items-center gap-1 rounded border border-primary-foreground/30 bg-primary-foreground/20 px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground shadow-sm">
                      <CornerDownLeft className="size-3.5" />
                      Enter
                    </kbd>
                  )}
                </Button>
                {!dialogManualMode && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogManualPlate(licensePlate)
                      setDialogManualMode(true)
                    }}
                    disabled={Boolean(status) && (status as string) === 'CHECKING_IN'}
                    className="h-11 w-full gap-2"
                  >
                    <Keyboard className="size-4" />
                    <span>Manual plate</span>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 px-6 py-6 sm:px-7">
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                {capturedImageUrl ? (
                  <img
                    src={capturedImageUrl}
                    alt="Latest OCR capture"
                    className="h-20 w-28 shrink-0 rounded-lg border bg-background object-contain"
                  />
                ) : null}
                <p className="text-sm text-muted-foreground">
                  OCR failed twice. Enter the plate manually to continue.
                </p>
              </div>
              <Field label="License plate">
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    className="h-12 font-mono text-base font-semibold uppercase tracking-wide"
                    value={licensePlate}
                    onChange={(event) => handleLicensePlateChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && licensePlate.trim()) {
                        event.preventDefault()
                        void lookupConfirmedPlate(licensePlate)
                      }
                    }}
                    placeholder="e.g. 59A-12345"
                  />
                  <Button
                    type="button"
                    onClick={() => void lookupConfirmedPlate(licensePlate)}
                    disabled={!licensePlate.trim() || plateLookupStatus === 'loading'}
                    className="h-12 shrink-0"
                  >
                    {plateLookupStatus === 'loading' ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
                    Continue
                  </Button>
                </div>
              </Field>

              {plateLookupStatus === 'error' ? (
                <Alert variant="destructive">
                  <AlertTitle>Plate lookup failed</AlertTitle>
                  <AlertDescription>{plateLookupError ?? 'Unable to lookup this plate.'}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip ticket and continue?</AlertDialogTitle>
            <AlertDialogDescription>
              The ticket for session <span className="font-mono font-semibold">{ticket?.sessionCode}</span> and plate{' '}
              <span className="font-mono font-semibold">{ticket ? (ticket.plateDisplay ?? ticket.licensePlate) : '-'}</span>{' '}
              has not been issued.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={skipTicket}>Skip and continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatLookupMode(mode: VehicleLookupMode) {
  if (mode === 'SUBSCRIBER') return 'Subscriber'
  if (mode === 'REGISTERED') return 'Registered'
  return 'Walk-in'
}

function buildExitEvidenceFromOcr({
  ocrEvidenceId,
  plate,
  confidence,
  localImageUrl,
}: {
  ocrEvidenceId?: string
  plate?: string | null
  confidence?: number | null
  localImageUrl?: string | null
}): CheckoutEvidence | null {
  if (!ocrEvidenceId && !localImageUrl && !plate) return null

  return {
    id: ocrEvidenceId ?? 'exit-scan-local',
    thumbnailUrl: null,
    imageUrl: null,
    capturedAt: new Date().toISOString(),
    ocrPlate: plate ? normalizePlateForApi(plate) : null,
    confirmedPlate: plate ? normalizePlateForApi(plate) : null,
    ocrConfidence: confidence ?? null,
    localImageUrl: localImageUrl ?? null,
  }
}

function ManualPlateInlineEntry({
  capturedImageUrl,
  licensePlate,
  onPlateChange,
  onConfirm,
  onCancel,
  isLoading,
  laneVehicleType,
}: {
  capturedImageUrl: string | null
  licensePlate: string
  onPlateChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
  laneVehicleType: VehicleType
}) {
  const plateInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // Auto-focus the plate input for rapid entry
    plateInputRef.current?.focus()
  }, [])

  const canSubmit = Boolean(licensePlate.trim())

  return (
    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-50/80 p-4 dark:bg-amber-950/20 dark:border-amber-500/20">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
          <Camera className="size-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Manual plate entry
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300/80">
            Could not read the plate from the image. Type the plate and press Enter to check in directly.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-amber-600 transition hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
          aria-label="Close manual entry"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {capturedImageUrl ? (
          <img
            src={capturedImageUrl}
            alt="Captured vehicle"
            className="h-24 w-36 shrink-0 rounded-lg border object-cover shadow-sm"
          />
        ) : null}
        <div className="flex-1 space-y-2.5">
          <div className="flex gap-2">
            <input
              ref={plateInputRef}
              type="text"
              value={licensePlate}
              onChange={(event) => onPlateChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) {
                  event.preventDefault()
                  onConfirm()
                }
              }}
              placeholder={laneVehicleType === 'car' ? '59A-12345' : '59-A1 12345'}
              className="h-11 flex-1 rounded-lg border border-amber-200 bg-white px-3 font-mono font-black uppercase tracking-wide placeholder:text-amber-300 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100 dark:placeholder:text-amber-700/50"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button
              type="button"
              onClick={onConfirm}
              disabled={!canSubmit || isLoading}
              className="h-11 gap-2 bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              <span>Check-in</span>
            </Button>
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            The captured image will be attached as evidence for this manual entry.
          </p>
        </div>
      </div>
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
