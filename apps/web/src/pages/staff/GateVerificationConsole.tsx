import { useCallback, useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Keyboard,
  Loader2,
  RotateCcw,
  ScanLine,
  X,
} from 'lucide-react'

import { normalizePlateForApi } from '../../lib/plate-format'
import {
  scanGatePlate,
  verifyGatePlate,
  type GateCheckoutSubMode,
  type GateRecommendedAction,
  type GateVehicleStatus,
  type GateVerifyResponse,
} from '../../lib/sessions-api'
import type { useToasts } from '../../lib/use-toasts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const BUILDING_NAME = import.meta.env.VITE_PBMS_BUILDING_NAME ?? 'PBMS Building'
const GATE_NAME = import.meta.env.VITE_PBMS_GATE_NAME ?? 'Main Gate'
const CAMERA_ID = import.meta.env.VITE_PLATE_RECOGNIZER_CAMERA_ID ?? 'staff-gate-camera'

type Phase = 'IDLE' | 'SCANNING' | 'RESULT_DISPLAYED' | 'CONFIRMED' | 'ERROR'

export type GateConfirmPayload = {
  plate: string
  canonicalPlate: string
  vehicleStatus: GateVehicleStatus
  recommendedAction: GateRecommendedAction
  confidence: number | null
  sessionId?: string
  reservationId?: string
  subMode?: GateCheckoutSubMode
  ocrEvidenceId?: string
  override?: { action: GateRecommendedAction; reason: string }
}

type GateVerificationConsoleProps = {
  onConfirm: (payload: GateConfirmPayload) => void
  onOpenOverride?: (payload: GateConfirmPayload) => void
  toasts: ReturnType<typeof useToasts>
}

const STATUS_BADGE: Record<GateVehicleStatus, { label: string; className: string }> = {
  ACTIVE_SESSION: {
    label: 'Active session',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  ACTIVE_RESERVATION: {
    label: 'Active reservation',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
  UNKNOWN: {
    label: 'Unknown',
    className: 'border-slate-400/40 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
}

const ACTION_LABEL: Record<GateRecommendedAction, string> = {
  CHECKOUT: 'Check out',
  CHECKIN: 'Check in',
  MANUAL_REVIEW: 'Manual review',
}

const CONFIRM_LABEL: Record<GateRecommendedAction, string> = {
  CHECKOUT: 'Confirm Check-out',
  CHECKIN: 'Confirm Check-in',
  MANUAL_REVIEW: 'Review Manually',
}

export function GateVerificationConsole({
  onConfirm,
  onOpenOverride,
  toasts,
}: GateVerificationConsoleProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<Phase>('IDLE')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null)
  const [ocrEvidenceId, setOcrEvidenceId] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualPlate, setManualPlate] = useState('')
  const [verifyResult, setVerifyResult] = useState<GateVerifyResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
    } catch (error) {
      setCameraError(extractErrorMessage(error))
    }
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
      } catch (error) {
        setCameraError(extractErrorMessage(error))
        setManualMode(true)
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (capturedImageUrl) {
        URL.revokeObjectURL(capturedImageUrl)
      }
    }
    // capturedImageUrl intentionally excluded; cleanup runs for the screen lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = useCallback(() => {
    setPhase('IDLE')
    setCapturedImageUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setOcrEvidenceId(null)
    setVerifyResult(null)
    setErrorMessage(null)
    setManualMode(false)
    setManualPlate('')
    void restartCamera()
  }, [restartCamera])

  const requestVerify = useCallback(
    async (canonicalPlate: string, ocrEvidenceId?: string) => {
      setPhase('SCANNING')
      try {
        const result = await verifyGatePlate({ canonicalPlate, ocrEvidenceId })
        setVerifyResult(result)
        setPhase('RESULT_DISPLAYED')
        toasts.showSuccess(`Plate detected: ${result.plate}`)
      } catch (error) {
        const message = extractErrorMessage(error)
        setErrorMessage(message)
        setPhase('ERROR')
        toasts.showError(message)
      }
    },
    [toasts],
  )

  const captureAndRecognize = useCallback(async () => {
    if (phase !== 'IDLE') return
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      toasts.showError('Camera is not ready yet')
      return
    }

    setPhase('SCANNING')
    // Downscale to max 1280px width (keeps aspect ratio) - full camera
    // resolution (1080p/4K) produces 2-5MB JPEGs, far above Plate
    // Recognizer Cloud's 3MB limit - mirrors StaffOcrCheckInPanel's pipeline.
    const MAX_CAPTURE_WIDTH = 1280
    const sourceWidth = video.videoWidth || MAX_CAPTURE_WIDTH
    const sourceHeight = video.videoHeight || 720
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / sourceWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sourceWidth * scale)
    canvas.height = Math.round(sourceHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) {
      setErrorMessage('Cannot capture camera frame')
      setPhase('ERROR')
      toasts.showError('Cannot capture camera frame')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.8)
    })
    if (!blob) {
      setErrorMessage('Cannot prepare image for OCR')
      setPhase('ERROR')
      toasts.showError('Cannot prepare image for OCR')
      return
    }

    const capturedUrl = URL.createObjectURL(blob)
    setCapturedImageUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return capturedUrl
    })
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setOcrEvidenceId(null)

    try {
      const response = await scanGatePlate({
        image: blob,
        cameraId: CAMERA_ID,
        buildingName: BUILDING_NAME,
        gateName: GATE_NAME,
      })

      if (response.mode === 'NEEDS_MANUAL_PLATE') {
        setOcrEvidenceId(response.ocrEvidenceId ?? '')
        setManualPlate('')
        setManualMode(true)
        setPhase('IDLE')
        toasts.showError('Could not read the plate. Type the plate below to verify.')
        return
      }

      const evidenceId = response.ocrEvidenceId ?? ''
      setOcrEvidenceId(evidenceId)
      const canonicalPlate = normalizePlateForApi(response.plateDisplay ?? response.plateConfirmed)
      if (canonicalPlate) {
        await requestVerify(canonicalPlate, evidenceId || undefined)
      } else {
        setErrorMessage('No plate detected. Enter the plate manually.')
        setManualMode(true)
        setPhase('ERROR')
      }
    } catch (error) {
      const message = extractErrorMessage(error)
      setErrorMessage(message)
      setPhase('ERROR')
      toasts.showError(message)
    } finally {
      await restartCamera()
    }
  }, [phase, requestVerify, restartCamera, toasts])

  const buildPayload = useCallback((): GateConfirmPayload | null => {
    if (!verifyResult) return null
    return {
      plate: verifyResult.plate,
      canonicalPlate: verifyResult.canonicalPlate,
      vehicleStatus: verifyResult.vehicleStatus,
      recommendedAction: verifyResult.recommendedAction,
      confidence: verifyResult.confidence,
      sessionId: verifyResult.sessionId,
      reservationId: verifyResult.reservationId,
      subMode: verifyResult.subMode,
      ocrEvidenceId: ocrEvidenceId || undefined,
    }
  }, [verifyResult, ocrEvidenceId])

  const confirmPrimary = useCallback(() => {
    const payload = buildPayload()
    if (!payload) return
    onConfirm(payload)
    setPhase('CONFIRMED')
  }, [buildPayload, onConfirm])

  const handleOverride = useCallback(() => {
    const payload = buildPayload()
    if (!payload) return
    onOpenOverride?.(payload)
  }, [buildPayload, onOpenOverride])

  const confirmManualPlate = useCallback(() => {
    const canonicalPlate = normalizePlateForApi(manualPlate)
    if (!canonicalPlate) return
    void requestVerify(canonicalPlate, ocrEvidenceId || undefined)
  }, [manualPlate, ocrEvidenceId, requestVerify])

  const scanDisabled = phase === 'SCANNING' || phase === 'RESULT_DISPLAYED' || phase === 'CONFIRMED'

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Camera className="size-4" />
            </span>
            Gate Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-primary/20 bg-muted shadow-inner">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
              autoPlay
            />
            {cameraError ? (
              <div className="absolute inset-0 grid place-items-center bg-background/95 p-6 text-center text-sm font-medium text-destructive">
                {cameraError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              onClick={() => void captureAndRecognize()}
              disabled={scanDisabled}
              className="h-11 sm:min-w-[180px]"
            >
              {phase === 'SCANNING' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanLine className="size-4" />
              )}
              {phase === 'SCANNING' ? 'Scanning plate...' : 'Scan Plate'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setManualPlate('')
                setManualMode(true)
              }}
              disabled={scanDisabled}
              className="h-11"
            >
              <Keyboard className="size-4" />
              Enter plate manually
            </Button>
          </div>

          {manualMode ? (
            <ManualPlateEntry
              capturedImageUrl={capturedImageUrl}
              value={manualPlate}
              onChange={setManualPlate}
              onConfirm={confirmManualPlate}
              onClose={() => setManualMode(false)}
              isLoading={phase === 'SCANNING'}
            />
          ) : null}
        </CardContent>
      </Card>

      {phase === 'RESULT_DISPLAYED' && verifyResult ? (
        <ScanResultCard
          result={verifyResult}
          capturedImageUrl={capturedImageUrl}
          onConfirm={confirmPrimary}
          onOverride={onOpenOverride ? handleOverride : undefined}
        />
      ) : null}

      {phase === 'CONFIRMED' && verifyResult ? (
        <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Confirmed</p>
                <p className="font-mono text-xs text-emerald-700 dark:text-emerald-300/80">{verifyResult.plate}</p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={reset} className="h-10">
              <RotateCcw className="size-4" />
              Next Vehicle
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {phase === 'ERROR' ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Verification failed</AlertTitle>
            <AlertDescription>{errorMessage ?? 'Unable to verify this plate.'}</AlertDescription>
          </Alert>
          <Button type="button" variant="outline" onClick={reset} className="h-10">
            <RotateCcw className="size-4" />
            Try Again
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ScanResultCard({
  result,
  capturedImageUrl,
  onConfirm,
  onOverride,
}: {
  result: GateVerifyResponse
  capturedImageUrl: string | null
  onConfirm: () => void
  onOverride?: () => void
}) {
  const status = STATUS_BADGE[result.vehicleStatus]
  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="border-b bg-muted/30">
        <CardTitle>Scan result</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Detected plate
            </p>
            <p className="mt-1 break-all font-mono text-3xl font-black tracking-[0.12em] text-foreground">
              {result.plate}
            </p>
          </div>
          {capturedImageUrl ? (
            <img
              src={capturedImageUrl}
              alt="Captured vehicle"
              className="h-20 w-32 shrink-0 rounded-lg border object-cover"
            />
          ) : null}
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/30 p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Status</dt>
            <dd className="mt-1.5"><Badge className={status.className}>{status.label}</Badge></dd>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recommended</dt>
            <dd className="mt-1.5 text-sm font-bold text-foreground">{ACTION_LABEL[result.recommendedAction]}</dd>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Confidence</dt>
            <dd className="mt-1.5 text-sm font-bold text-foreground">
              {result.confidence != null ? `${Math.round(result.confidence * 100)}%` : '—'}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={onConfirm} className="h-11 flex-1">
            <CheckCircle2 className="size-4" />
            {CONFIRM_LABEL[result.recommendedAction]}
          </Button>
          {onOverride ? (
            <Button type="button" variant="outline" onClick={onOverride} className="h-11">
              Override
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ManualPlateEntry({
  capturedImageUrl,
  value,
  onChange,
  onConfirm,
  onClose,
  isLoading,
}: {
  capturedImageUrl: string | null
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
  isLoading: boolean
}) {
  const plateInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    plateInputRef.current?.focus()
  }, [])

  const canSubmit = Boolean(value.trim())

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-50/80 p-4 dark:border-amber-500/20 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Keyboard className="size-4 text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Manual plate entry</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-amber-600 transition hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
          aria-label="Close manual entry"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300/80">
        Type the plate and press Verify when the camera or OCR cannot read it.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {capturedImageUrl ? (
          <img
            src={capturedImageUrl}
            alt="Captured vehicle"
            className="h-20 w-32 shrink-0 rounded-lg border object-cover"
          />
        ) : null}
        <div className="flex flex-1 gap-2">
          <input
            ref={plateInputRef}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit && !isLoading) {
                event.preventDefault()
                onConfirm()
              }
            }}
            placeholder="59A-12345"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 font-mono font-black uppercase tracking-wide placeholder:text-amber-300 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100 dark:placeholder:text-amber-700/50"
          />
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!canSubmit || isLoading}
            className="h-11 gap-2"
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Verify
          </Button>
        </div>
      </div>
    </div>
  )
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
