import { useCallback, useEffect, useRef, useState } from 'react'
import { QRScanner } from '../../../components/qr-scanner/QRScanner'
import {
  Camera,
  CameraOff,
  Clock3,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
} from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { scanGatePlate } from '../../../lib/sessions-api'
import { normalizePlateForApi } from '../../../lib/plate-format'
import { Card, CardContent } from '../../../components/ui/card'

export type ResolvedInput = {
  type: 'qr' | 'plate'
  value: string
  capturedImage?: {
    blob: Blob
    dataUrl: string
    plateNumber: string
  }
}

export interface SmartGateInputProps {
  onResolved: (input: ResolvedInput) => void
  isLoading?: boolean
  onError?: (message: string) => void
  laneVehicleType?: 'car' | 'motorbike'
}

const CAMERA_ID = 'staff-gate-camera'
const BUILDING_NAME = 'PBMS Building'
const GATE_NAME = 'Main Gate'

// UUID v4/v5 (session QR encodes the session id directly)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function looksLikeQrToken(value: string): boolean {
  const v = value.trim()
  // Session QR = UUID.
  if (UUID_RE.test(v)) return true
  // Reservation check-in QR = JWT (header.payload.signature).
  return v.split('.').length === 3 && v.length > 40
}

export function SmartGateInput({
  onResolved,
  isLoading,
  onError,
  laneVehicleType = 'car',
}: SmartGateInputProps) {
  const [text, setText] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString('vi-VN'))

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Live Clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('vi-VN'))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Start live camera stream
  const startCamera = useCallback(async () => {
    setCameraLoading(true)
    setCameraError(null)

    // Stop existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }

      setIsCameraActive(true)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Không thể truy cập camera. Vui lòng cấp quyền truy cập camera.'
      setCameraError(msg)
      setIsCameraActive(false)
    } finally {
      setCameraLoading(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraActive(false)
  }, [])

  // Initialize camera on mount
  useEffect(() => {
    void startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  // Manual lookup on Enter or click Tra cứu
  const handleSubmit = useCallback(() => {
    const val = text.trim()
    if (!val) return
    if (looksLikeQrToken(val)) {
      onResolved({ type: 'qr', value: val })
    } else {
      onResolved({ type: 'plate', value: normalizePlateForApi(val) })
    }
  }, [text, onResolved])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && !isLoading && !ocrBusy) {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit, isLoading, ocrBusy],
  )

  const handleQrScanned = useCallback(
    (decoded: string) => {
      setShowQr(false)
      const value = decoded.trim()
      if (!value) return
      onResolved({ type: 'qr', value })
    },
    [onResolved],
  )

  const handleQrManual = useCallback(
    (value: string) => {
      setShowQr(false)
      const v = value.trim()
      if (!v) return
      if (looksLikeQrToken(v)) onResolved({ type: 'qr', value: v })
      else onResolved({ type: 'plate', value: normalizePlateForApi(v) })
    },
    [onResolved],
  )

  // Capture current live frame and send to OCR
  const captureAndRecognize = useCallback(async () => {
    if (ocrBusy) return

    const video = videoRef.current
    if (!video || !isCameraActive || video.readyState < 2) {
      onError?.('Camera chưa sẵn sàng để chụp. Vui lòng thử lại.')
      return
    }

    setOcrBusy(true)
    try {
      const sourceWidth = video.videoWidth || 1280
      const sourceHeight = video.videoHeight || 720

      const canvas = document.createElement('canvas')
      canvas.width = sourceWidth
      canvas.height = sourceHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Không thể khởi tạo canvas frame')

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
      )

      if (!blob) throw new Error('Không thể chuẩn bị ảnh để gửi OCR')

      const response = await scanGatePlate({
        image: blob,
        cameraId: CAMERA_ID,
        buildingName: BUILDING_NAME,
        gateName: GATE_NAME,
      })

      if (response.mode === 'NEEDS_MANUAL_PLATE') {
        onError?.('Không nhận diện rõ biển số. Vui lòng nhập tay bên dưới hoặc chỉnh góc camera.')
        return
      }

      const plate = response.plateDisplay || response.plateConfirmed || ''
      if (!plate) {
        onError?.('Không nhận diện rõ biển số. Vui lòng nhập tay bên dưới.')
        return
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      onResolved({
        type: 'plate',
        value: normalizePlateForApi(plate),
        capturedImage: {
          blob,
          dataUrl,
          plateNumber: plate,
        },
      })
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Nhận diện biển số OCR thất bại.')
    } finally {
      setOcrBusy(false)
    }
  }, [ocrBusy, isCameraActive, onError, onResolved])

  // Global spacebar listener for quick capture when not typing in input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') return

      if (e.code === 'Space' && isCameraActive && !ocrBusy && !isLoading) {
        e.preventDefault()
        void captureAndRecognize()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [isCameraActive, ocrBusy, isLoading, captureAndRecognize])

  const busy = isLoading || ocrBusy

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {/* 1. Live Camera Viewfinder Card */}
      <Card className="overflow-hidden border border-slate-200 bg-slate-950 shadow-md dark:border-slate-800">
        <CardContent className="p-0">
          <div className="relative aspect-video w-full overflow-hidden bg-slate-950 sm:aspect-[16/9] md:max-h-[460px]">
            {/* Live Video Stream */}
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`h-full w-full object-cover transition-opacity duration-300 ${
                isCameraActive ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Viewfinder Bounding Guidelines */}
            {isCameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="relative h-44 w-full max-w-sm rounded-2xl border-2 border-dashed border-blue-400/70 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.2)] backdrop-blur-[1px]">
                  {/* Corner Crosshairs */}
                  <span className="absolute -left-1 -top-1 size-4 border-l-4 border-t-4 border-blue-400" />
                  <span className="absolute -right-1 -top-1 size-4 border-r-4 border-t-4 border-blue-400" />
                  <span className="absolute -bottom-1 -left-1 size-4 border-b-4 border-l-4 border-blue-400" />
                  <span className="absolute -bottom-1 -right-1 size-4 border-b-4 border-r-4 border-blue-400" />

                  <div className="flex h-full items-center justify-center">
                    <span className="rounded-md bg-black/60 px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-blue-200 backdrop-blur-sm">
                      Đặt biển số vào khung này
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Top Info Bar Overlay */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3.5 sm:p-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-xs font-bold text-white shadow-sm backdrop-blur-md">
                  <span className="size-2 animate-pulse rounded-full bg-white" />
                  LIVE CAMERA
                </span>
                <span className="hidden rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-slate-200 backdrop-blur-md sm:inline-flex">
                  {laneVehicleType === 'car' ? '🚗 Làn Ô tô' : '🛵 Làn Xe máy'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 font-mono text-xs font-semibold text-slate-200 backdrop-blur-md">
                  <Clock3 className="size-3.5 text-blue-400" />
                  {currentTime}
                </span>
              </div>
            </div>

            {/* Loading / Error States */}
            {cameraLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 text-slate-400">
                <Loader2 className="size-8 animate-spin text-blue-500" />
                <p className="text-xs font-medium">Đang kết nối camera trực tiếp...</p>
              </div>
            )}

            {!cameraLoading && cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/95 p-6 text-center text-slate-300">
                <CameraOff className="size-10 text-slate-500" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">Không thể kết nối camera</p>
                  <p className="max-w-md text-xs text-slate-400">{cameraError}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={startCamera}
                  className="mt-1 gap-1.5 border-slate-700 bg-slate-800 text-xs text-white hover:bg-slate-700"
                >
                  <RefreshCw className="size-3.5" />
                  Thử lại camera
                </Button>
              </div>
            )}

            {/* Bottom Actions Bar Overlay inside Camera */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3.5 sm:p-4">
              <div className="flex items-center gap-2">
                {isCameraActive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={stopCamera}
                    className="h-8 gap-1 rounded-lg bg-black/50 text-xs font-medium text-slate-300 hover:bg-black/80 hover:text-white"
                  >
                    <CameraOff className="size-3.5" />
                    Tắt camera
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={startCamera}
                    className="h-8 gap-1 rounded-lg bg-black/50 text-xs font-medium text-slate-300 hover:bg-black/80 hover:text-white"
                  >
                    <Camera className="size-3.5" />
                    Bật camera
                  </Button>
                )}
              </div>

              {/* Big Scan Button */}
              <Button
                type="button"
                onClick={captureAndRecognize}
                disabled={busy || !isCameraActive}
                className="h-10 gap-2 bg-blue-600 px-5 font-bold text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-500 active:scale-95 disabled:hover:scale-100"
              >
                {ocrBusy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Đang nhận diện AI...
                  </>
                ) : (
                  <>
                    <ScanLine className="size-4" />
                    Chụp &amp; Quét biển số (Space)
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Smart Search & QR Input Bar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập biển số xe (vd. 30A-123.45) hoặc dán mã QR..."
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 font-mono text-base font-bold uppercase tracking-wide placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !text.trim()}
            className="h-11 gap-1.5 px-5 font-semibold"
          >
            <Search className="size-4" />
            Tra cứu (Enter)
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowQr(true)}
            disabled={busy}
            className="h-11 gap-1.5 font-semibold"
          >
            <QrCode className="size-4" />
            Quét mã QR
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          💡 <strong>Mẹo:</strong> Hướng camera về phía biển số xe và bấm phím <strong>Space</strong> (hoặc nút Quét biển số). Hệ thống sẽ tự động tra cứu để check-in hoặc check-out.
        </p>
      </div>

      {showQr && (
        <QRScanner
          onScan={handleQrScanned}
          onManualInput={handleQrManual}
          onClose={() => setShowQr(false)}
          title="Quét mã QR"
          instructions="Đưa mã QR trên app hoặc thẻ vé vào khung hình."
        />
      )}
    </div>
  )
}
