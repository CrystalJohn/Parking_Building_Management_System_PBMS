import { useCallback, useEffect, useRef, useState } from 'react'
import { QRScanner } from '../../../components/qr-scanner/QRScanner'
import { Camera, Loader2, QrCode, Search } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { scanGatePlate, type GateScanResponse } from '../../../lib/sessions-api'
import { normalizePlateForApi } from '../../../lib/plate-format'

export type ResolvedInput = { type: 'qr' | 'plate'; value: string }

interface SmartGateInputProps {
  onResolved: (input: ResolvedInput) => void
  isLoading?: boolean
  onError?: (message: string) => void
}

const CAMERA_ID = 'staff-gate-camera'
const BUILDING_NAME = 'PBMS Building'
const GATE_NAME = 'Main Gate'

// UUID v4/v5 (session QR encodes the session id directly)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function looksLikeQrToken(value: string): boolean {
  const v = value.trim()
  // Session QR = UUID. Anything else scanned (reservation token) is also a QR.
  return UUID_RE.test(v) || v.length >= 8
}

export function SmartGateInput({ onResolved, isLoading, onError }: SmartGateInputProps) {
  const [text, setText] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Debounce manual plate input (400ms) before resolving as a plate lookup.
  useEffect(() => {
    const normalized = normalizePlateForApi(text)
    if (normalized.length < 6) return
    const timer = setTimeout(() => {
      onResolved({ type: 'plate', value: normalized })
    }, 400)
    return () => clearTimeout(timer)
  }, [text, onResolved])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const handleQrScanned = useCallback(
    (decoded: string) => {
      setShowQr(false)
      const value = decoded.trim()
      if (!value) return
      // A scanned code is always treated as a QR token (session id or reservation token).
      onResolved({ type: 'qr', value })
    },
    [onResolved],
  )

  const handleQrManual = useCallback(
    (value: string) => {
      setShowQr(false)
      const v = value.trim()
      if (!v) return
      // Manual entry inside the QR dialog may be a session id or a plate.
      if (looksLikeQrToken(v)) onResolved({ type: 'qr', value: v })
      else onResolved({ type: 'plate', value: normalizePlateForApi(v) })
    },
    [onResolved],
  )

  const captureAndRecognize = useCallback(async () => {
    if (ocrBusy) return
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      onError?.('Camera is not ready yet')
      return
    }
    setOcrBusy(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      video.srcObject = stream
      await video.play().catch(() => undefined)

      const sourceWidth = video.videoWidth || 1280
      const sourceHeight = video.videoHeight || 720
      const canvas = document.createElement('canvas')
      canvas.width = sourceWidth
      canvas.height = sourceHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Cannot read camera frame')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
      )
      if (!blob) throw new Error('Cannot prepare image for OCR')
      stopCamera()

      const response: GateScanResponse = await scanGatePlate({
        image: blob,
        cameraId: CAMERA_ID,
        buildingName: BUILDING_NAME,
        gateName: GATE_NAME,
      })
      const plate =
        response.plateDisplay || response.plateConfirmed || response.canonicalPlate || ''
      if (!plate) {
        onError?.('Could not read the plate clearly. Type the plate below.')
        return
      }
      onResolved({ type: 'plate', value: normalizePlateForApi(plate) })
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'OCR scan failed')
    } finally {
      setOcrBusy(false)
      stopCamera()
    }
  }, [ocrBusy, onError, onResolved, stopCamera])

  useEffect(() => () => stopCamera(), [stopCamera])

  const busy = isLoading || ocrBusy

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nhập biển số (vd. 30A-123.45) hoặc dán mã QR"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 font-mono text-base font-bold uppercase tracking-wide placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowQr(true)}
          disabled={busy}
          className="h-11"
        >
          <QrCode className="size-4" />
          Scan QR
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={captureAndRecognize}
          disabled={busy}
          className="h-11"
        >
          {ocrBusy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          Scan Plate
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Quét QR phiên / QR đặt trước, hoặc nhập biển số. Hệ thống tự nhận biết xe đang
        gửi hay đã gửi để mở đúng luồng.
      </p>

      {showQr && (
        <QRScanner
          onScan={handleQrScanned}
          onManualInput={handleQrManual}
          onClose={() => setShowQr(false)}
          title="Quét mã QR"
          instructions="Quét QR phiên (tại cổng) hoặc QR đặt trước từ app."
        />
      )}

      {/* Hidden video element used by the OCR capture path */}
      <video ref={videoRef} className="hidden" playsInline autoPlay muted />
    </div>
  )
}
