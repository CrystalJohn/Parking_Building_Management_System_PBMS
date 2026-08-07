import { useCallback, useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Keyboard,
  Loader2,
  Pencil,
  RotateCcw,
  ScanLine,
  X,
  Info,
} from 'lucide-react'

import {
  normalizePlateForApi,
  isValidVietnamesePlate,
  formatVietnamesePlateDisplay,
} from '../../lib/plate-format'
import {
  scanGatePlate,
  verifyGatePlate,
  getCheckoutPreview,
  type GateCheckoutSubMode,
  type GateRecommendedAction,
  type GateVehicleStatus,
  type GateVerifyResponse,
} from '../../lib/sessions-api'
import { CheckoutPreviewModal } from './CheckoutPreviewModal'
import type { useToasts } from '../../lib/use-toasts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useGateStateMachine } from './useGateStateMachine'

function extractErrorMessage(err: unknown): string {
  if (isAxiosError(err)) return err.response?.data?.message ?? err.message
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred'
}

const BUILDING_NAME = import.meta.env.VITE_PBMS_BUILDING_NAME ?? 'PBMS Building'
const GATE_NAME = import.meta.env.VITE_PBMS_GATE_NAME ?? 'Main Gate'
const CAMERA_ID = import.meta.env.VITE_PLATE_RECOGNIZER_CAMERA_ID ?? 'staff-gate-camera'

const OCR_HIGH_CONF_THRESHOLD = Number(import.meta.env.VITE_OCR_HIGH_CONFIDENCE_THRESHOLD) || 0.95
const OCR_LOW_CONF_THRESHOLD = Number(import.meta.env.VITE_OCR_LOW_CONFIDENCE_THRESHOLD) || 0.85

export type GateConfirmPayload = {
  displayPlate: string
  vehicleType: 'CAR' | 'MOTORBIKE' | 'UNKNOWN'
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
  onConfirm: (payload: GateConfirmPayload, action?: GateRecommendedAction) => Promise<void> | void
  onOpenOverride?: (payload: GateConfirmPayload) => void
  toasts: ReturnType<typeof useToasts>
}

const STATUS_BADGE: Record<GateVehicleStatus, { label: string; className: string }> = {
  ACTIVE_SESSION: {
    label: 'ACTIVE PARKING SESSION',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  ACTIVE_RESERVATION: {
    label: 'ACTIVE RESERVATION',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
  UNKNOWN: {
    label: 'UNKNOWN VEHICLE',
    className: 'border-slate-400/40 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
}

const ACTION_LABEL: Record<GateRecommendedAction, string> = {
  CHECKOUT: 'Check out',
  CHECKIN: 'Check in',
  MANUAL_REVIEW: 'Manual review',
}

const CONFIRM_LABEL: Record<GateRecommendedAction, string> = {
  CHECKOUT: 'Complete Check-out',
  CHECKIN: 'Complete Check-in',
  MANUAL_REVIEW: 'Manual Review',
}

export function GateVerificationConsole({
  onConfirm,
  onOpenOverride,
  toasts,
}: GateVerificationConsoleProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const { state, dispatch } = useGateStateMachine()
  const { phase, verificationResult, ocrEvidenceId, manualPlate, error, previewData, checkoutSnapshotUrl } = state

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null)

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
    } catch (err) {
      setCameraError(extractErrorMessage(err))
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
      } catch (err) {
        setCameraError(extractErrorMessage(err))
        dispatch({ type: 'SET_MANUAL_ENTRY' })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
    setCapturedImageUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    void restartCamera()
  }, [restartCamera, dispatch])

  const requestVerify = useCallback(
    async (canonicalPlate: string, currentEvidenceId?: string | null) => {
      dispatch({ type: 'START_VERIFY', evidenceId: currentEvidenceId ?? undefined })
      try {
        const result = await verifyGatePlate({ canonicalPlate, ocrEvidenceId: currentEvidenceId ?? undefined })
        if (result.vehicleStatus === 'ACTIVE_SESSION' && result.recommendedAction === 'CHECKOUT' && result.sessionId) {
          dispatch({ type: 'SET_RESULT', result })
          dispatch({ type: 'START_CHECKOUT_PREVIEW', snapshotUrl: capturedImageUrl || '' })
          try {
            const previewData = await getCheckoutPreview(result.sessionId)
            dispatch({ type: 'SET_CHECKOUT_PREVIEW', data: previewData })
          } catch (err) {
            const message = extractErrorMessage(err)
            dispatch({ type: 'SET_ERROR', error: message })
            toasts.showError(message)
          }
          return
        }

        dispatch({ type: 'SET_RESULT', result })
        toasts.showSuccess(`Plate detected: ${result.displayPlate}`)
      } catch (err) {
        const message = extractErrorMessage(err)
        dispatch({ type: 'SET_ERROR', error: message })
        toasts.showError(message)
      }
    },
    [toasts, dispatch, capturedImageUrl],
  )

  const captureAndRecognize = useCallback(async () => {
    if (phase !== 'IDLE' && phase !== 'MANUAL_ENTRY') return
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      toasts.showError('Camera is not ready yet')
      return
    }

    dispatch({ type: 'START_SCAN' })
    const MAX_CAPTURE_WIDTH = 1280
    const sourceWidth = video.videoWidth || MAX_CAPTURE_WIDTH
    const sourceHeight = video.videoHeight || 720
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / sourceWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(sourceWidth * scale)
    canvas.height = Math.round(sourceHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) {
      dispatch({ type: 'SET_ERROR', error: 'Cannot capture camera frame' })
      toasts.showError('Cannot capture camera frame')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.8)
    })
    if (!blob) {
      dispatch({ type: 'SET_ERROR', error: 'Cannot prepare image for OCR' })
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

    try {
      const response = await scanGatePlate({
        image: blob,
        cameraId: CAMERA_ID,
        buildingName: BUILDING_NAME,
        gateName: GATE_NAME,
      })

      const evidenceId = response.ocrEvidenceId ?? undefined

      if (!response.canonicalPlate || (response.confidence != null && response.confidence < OCR_LOW_CONF_THRESHOLD)) {
        dispatch({ type: 'SET_MANUAL_ENTRY', evidenceId })
        toasts.showError('Could not read the plate clearly. Type the plate below to verify.')
        return
      }

      if (response.vehicleStatus === 'ACTIVE_SESSION' && response.recommendedAction === 'CHECKOUT' && response.sessionId) {
        dispatch({ type: 'SET_RESULT', result: response })
        dispatch({ type: 'START_CHECKOUT_PREVIEW', snapshotUrl: capturedUrl })
        try {
          const previewData = await getCheckoutPreview(response.sessionId)
          dispatch({ type: 'SET_CHECKOUT_PREVIEW', data: previewData })
        } catch (err) {
          const message = extractErrorMessage(err)
          dispatch({ type: 'SET_ERROR', error: message })
          toasts.showError(message)
        }
        return
      }

      dispatch({ type: 'SET_RESULT', result: response })
    } catch (err) {
      const message = extractErrorMessage(err)
      dispatch({ type: 'SET_ERROR', error: message })
      toasts.showError(message)
    }
  }, [phase, dispatch, toasts])

  const buildPayload = useCallback((): GateConfirmPayload | null => {
    if (!verificationResult) return null
    console.log('[GATE_TRACE] buildPayload', {
      sessionCode: verificationResult.sessionId ?? '-',
      plate: verificationResult.canonicalPlate,
      ocrEvidenceId: ocrEvidenceId ?? null,
      vehicleStatus: verificationResult.vehicleStatus,
    })
    return {
      displayPlate: verificationResult.displayPlate,
      vehicleType: verificationResult.vehicleType,
      canonicalPlate: verificationResult.canonicalPlate,
      vehicleStatus: verificationResult.vehicleStatus,
      recommendedAction: verificationResult.recommendedAction,
      confidence: verificationResult.confidence,
      sessionId: verificationResult.sessionId,
      reservationId: verificationResult.reservationId,
      subMode: verificationResult.subMode,
      ocrEvidenceId: ocrEvidenceId || undefined,
    }
  }, [verificationResult, ocrEvidenceId])

  const confirmPrimary = useCallback(async () => {
    const payload = buildPayload()
    if (!payload) return
    setIsSubmitting(true)
    try {
      await onConfirm(payload)
      dispatch({ type: 'SUBMIT_CONFIRM', action: payload.recommendedAction })
      
      // Auto-reset after a short delay to reopen the camera
      setTimeout(() => {
        reset()
      }, 1500)
    } catch (err) {
      const message = extractErrorMessage(err)
      dispatch({ type: 'SET_ERROR', error: message })
      toasts.showError(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [buildPayload, onConfirm, dispatch, toasts, reset])

  const confirmCheckout = useCallback(async () => {
    const payload = buildPayload()
    if (!payload || phase === 'SUBMITTING_CONFIRM') return
    dispatch({ type: 'SUBMIT_CONFIRM', action: 'CHECKOUT' })
    try {
      await onConfirm(payload, 'CHECKOUT')
      reset()
    } catch (e) {
      if (previewData) {
        dispatch({ type: 'SET_CHECKOUT_PREVIEW', data: previewData })
      }
    }
  }, [buildPayload, onConfirm, dispatch, reset, phase, previewData])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      if (isTyping) return

      if (event.code === 'Space' && (phase === 'IDLE' || phase === 'MANUAL_ENTRY')) {
        event.preventDefault()
        void captureAndRecognize()
      }
      if (event.key === 'Enter' && phase === 'RESULT_DISPLAYED') {
        event.preventDefault()
        void confirmPrimary()
      }
      if (event.key === 'Enter' && (phase === 'CHECKOUT_PREVIEW')) {
        event.preventDefault()
        void confirmCheckout()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        reset()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [captureAndRecognize, confirmPrimary, confirmCheckout, phase, reset])

  const handleOverride = useCallback(() => {
    const payload = buildPayload()
    if (!payload) return
    onOpenOverride?.(payload)
  }, [buildPayload, onOpenOverride])

  const confirmManualPlate = useCallback(() => {
    const canonicalPlate = normalizePlateForApi(manualPlate)
    if (!canonicalPlate) return
    void requestVerify(canonicalPlate, ocrEvidenceId)
  }, [manualPlate, ocrEvidenceId, requestVerify])

  const scanDisabled = phase === 'SCANNING' || phase === 'VERIFYING' || phase === 'RESULT_DISPLAYED' || phase === 'SUBMITTING_CONFIRM'
  const isManualMode = phase === 'MANUAL_ENTRY' || phase === 'VERIFYING' || (phase === 'ERROR' && manualPlate !== '') || phase === 'CHECKOUT_PREVIEW_LOADING' || phase === 'CHECKOUT_PREVIEW'

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

            {/* Loading Checkout Preview */}
            {phase === 'CHECKOUT_PREVIEW_LOADING' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 text-white rounded-2xl animate-in fade-in">
                <Loader2 className="size-10 animate-spin text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">Loading session details...</h3>
                <p className="text-white/70">Calculating fee...</p>
                <p className="text-white/50 text-sm mt-1">Preparing checkout preview...</p>
              </div>
            )}
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
              {phase === 'SCANNING' ? 'Scanning plate...' : 'Scan Plate (Space)'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                dispatch({ type: 'SET_MANUAL_ENTRY' })
              }}
              disabled={scanDisabled}
              className="h-11"
            >
              <Keyboard className="size-4" />
              Enter plate manually
            </Button>
          </div>

          {isManualMode ? (
            <ManualPlateEntry
              capturedImageUrl={capturedImageUrl}
              value={manualPlate}
              onChange={(p) => dispatch({ type: 'SET_MANUAL_PLATE', plate: p })}
              onConfirm={confirmManualPlate}
              onClose={() => reset()}
              isLoading={phase === 'VERIFYING'}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* Checkout Preview Modal */}
      {(phase === 'CHECKOUT_PREVIEW' || phase === 'SUBMITTING_CONFIRM') && previewData && (
        <CheckoutPreviewModal
          previewData={previewData}
          checkoutSnapshotUrl={checkoutSnapshotUrl}
          exitConfidence={verificationResult?.confidence ?? null}
          exitVehicleType={verificationResult?.vehicleTypeDetected ?? null}
          exitPlate={verificationResult?.displayPlate ?? verificationResult?.canonicalPlate ?? null}
          submitting={phase === 'SUBMITTING_CONFIRM'}
          onConfirm={confirmCheckout}
          onCancel={reset}
          onOverride={() => {
            if (buildPayload()) {
              onConfirm(buildPayload()!, 'MANUAL_REVIEW')
            }
          }}
        />
      )}

      {/* Result Card Modal */}
      {(phase === 'RESULT_DISPLAYED' || phase === 'ERROR') && verificationResult && (
        <ScanResultCard
          result={verificationResult}
          capturedImageUrl={capturedImageUrl}
          onConfirm={confirmPrimary}
          onOverride={onOpenOverride ? handleOverride : undefined}
          onReverify={(plate) => {
            const canonical = normalizePlateForApi(plate)
            if (!isValidVietnamesePlate(canonical)) {
              toasts.showError('Biển số không hợp lệ. Vui lòng nhập biển số VN (vd. 30A-123.45 hoặc 59D1-666.66).')
              return
            }
            void requestVerify(canonical, ocrEvidenceId)
          }}
          open={true}
          submitting={isSubmitting}
          onOpenChange={(open) => {
            if (!open) reset()
          }}
        />
      )}

      {phase === 'SUBMITTING_CONFIRM' && verificationResult ? (
        <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Confirmed</p>
                <p className="font-mono text-xs text-emerald-700 dark:text-emerald-300/80">{verificationResult.displayPlate}</p>
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
            <AlertDescription>{error ?? 'Unable to verify this plate.'}</AlertDescription>
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
  onReverify,
  open,
  submitting,
  onOpenChange,
}: {
  result: GateVerifyResponse
  capturedImageUrl: string | null
  onConfirm: () => void
  onOverride?: () => void
  onReverify?: (plate: string) => void
  open: boolean
  submitting?: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement | null>(null)

  function startEdit() {
    setEditValue(normalizePlateForApi(result.displayPlate ?? ''))
    setIsEditing(true)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditValue('')
  }

  // Raw (unformatted) plate typed by staff — e.g. "69d166666"
  const editRaw = normalizePlateForApi(editValue)
  // Live-formatted preview — e.g. "69-D1 666.66"; null until valid length/shape
  const editDisplay = formatVietnamesePlateDisplay(editRaw)
  const isEditValid = isValidVietnamesePlate(editRaw)

  function submitEdit() {
    if (!isEditValid || !onReverify) return
    // Do NOT clear isEditing here: requestVerify dispatches START_VERIFY,
    // which unmounts this card and re-opens it fresh on SET_RESULT.
    onReverify(editRaw)
  }

  let status = STATUS_BADGE[result.vehicleStatus]
  if (result.vehicleStatus === 'UNKNOWN' && result.recommendedAction === 'CHECKIN') {
    status = {
      label: 'READY FOR CHECK-IN',
      className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    }
  }

  const isLowConfidence = result.confidence != null && result.confidence < OCR_HIGH_CONF_THRESHOLD && result.confidence >= OCR_LOW_CONF_THRESHOLD

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-[600px] p-0 overflow-hidden flex flex-col">
        {result.recommendedAction !== 'MANUAL_REVIEW' && (
          <div className={`px-6 py-4 font-black text-2xl text-white uppercase text-center tracking-widest ${result.recommendedAction === 'CHECKIN' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
            {result.recommendedAction === 'CHECKIN' ? 'CHECK-IN' : 'CHECK-OUT'}
          </div>
        )}
        <div className="p-6 space-y-6">
          {isLowConfidence && (
            <Alert className="bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-200">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle>Low Confidence Reading</AlertTitle>
              <AlertDescription>
                The camera is not fully confident ({Math.round(result.confidence! * 100)}%). Please double-check the plate.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Detected plate
                </p>
                {!isEditing && onReverify && (
                  <button
                    type="button"
                    onClick={startEdit}
                    title="Edit plate"
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Pencil className="size-3" />
                    Edit
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); submitEdit() }
                      if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                    }}
                    placeholder="69D166666"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={editRaw.length > 0 && !isEditValid}
                    className={`h-11 w-full rounded-lg border px-3 font-mono text-xl font-black uppercase tracking-widest placeholder:text-amber-300 focus:outline-none focus:ring-2 dark:bg-amber-950/40 dark:text-amber-100 ${
                      editRaw.length > 0 && !isEditValid
                        ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/20 dark:border-red-700'
                        : 'border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-amber-500/20 dark:border-amber-700'
                    }`}
                  />
                  {editDisplay ? (
                    <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      → {editDisplay}
                    </p>
                  ) : editRaw.length > 0 ? (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                      Biển số chưa đúng định dạng VN (xe máy 9 ký tự, xe hơi 8 ký tự).
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={submitEdit}
                      disabled={!isEditValid}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40 transition-colors"
                    >
                      <RotateCcw className="size-3.5" />
                      Re-verify
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 break-all font-mono text-3xl font-black tracking-[0.12em] text-foreground">
                  {result.displayPlate}
                </p>
              )}
            </div>
            {capturedImageUrl ? (
              <img
                src={capturedImageUrl}
                alt="Captured vehicle"
                className="h-32 w-48 shrink-0 rounded-lg border object-cover"
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Vehicle Status</p>
                <div className="mt-1.5"><Badge className={status.className}>{status.label}</Badge></div>
              </div>
              {result.sessionId && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Session</p>
                  <div className="mt-1.5 font-mono text-sm font-semibold text-foreground">{result.sessionId.slice(0, 8)}...</div>
                </div>
              )}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">OCR Confidence</p>
                <div className="mt-1.5 text-sm font-bold text-foreground">
                  {result.confidence != null ? `${Math.round(result.confidence * 100)}%` : '—'}
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">Decision Reason</p>
              <ul className="space-y-2 text-sm">
                {result.vehicleStatus === 'ACTIVE_SESSION' && (
                  <>
                    <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Active parking session found</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Plate matched active session</li>
                  </>
                )}
                {result.vehicleStatus === 'ACTIVE_RESERVATION' && (
                  <>
                    <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Active reservation found</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Reservation still valid</li>
                  </>
                )}
                {result.vehicleStatus === 'UNKNOWN' && result.recommendedAction === 'CHECKIN' && (
                  <>
                    <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> New vehicle detected</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Ready to assign parking session</li>
                  </>
                )}
                {result.vehicleStatus === 'UNKNOWN' && result.recommendedAction === 'MANUAL_REVIEW' && (
                  <>
                    <li className="flex items-center gap-2"><Info className="size-4 text-slate-500" /> No active session or reservation</li>
                  </>
                )}
              </ul>
              <p className="mt-4 text-sm font-semibold text-foreground">
                System recommends <span className="uppercase text-primary">{ACTION_LABEL[result.recommendedAction]}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row pt-2">
            <Button type="button" onClick={onConfirm} className="h-11 flex-1" disabled={submitting}>
              {submitting ? (
                <div className="flex items-center gap-2">
                  <RotateCcw className="size-4 animate-spin" /> Processing...
                </div>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  {CONFIRM_LABEL[result.recommendedAction]} (Enter)
                </>
              )}
            </Button>
            {onOverride ? (
              <Button type="button" variant="outline" onClick={onOverride} className="h-11">
                Override
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

