import { useEffect, useRef, useState } from 'react'
import { scanPlate } from '../../lib/plate-recognition-api'

interface LicensePlateScannerProps {
  onDetected: (plate: string) => void
  onCaptured?: (plate: string, imageBlob: Blob, imageUrl: string) => void
  onClose: () => void
}

/**
 * Crop the scan-zone region from the video frame onto a canvas.
 * The zone mirrors the overlay rectangle drawn on screen.
 */
function cropFrameToCanvas(
  video: HTMLVideoElement,
  overlay: HTMLCanvasElement,
): HTMLCanvasElement {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const cw = overlay.offsetWidth
  const ch = overlay.offsetHeight
  if (!vw || !vh || !cw || !ch) {
    throw new Error('Video or overlay not ready')
  }

  const zoneW = Math.min(cw * 0.85, 360)
  const zoneH = Math.min(ch * 0.55, 220)
  const zoneX = (cw - zoneW) / 2
  const zoneY = (ch - zoneH) / 2

  const scale = Math.max(cw / vw, ch / vh)
  const offsetX = (vw * scale - cw) / 2
  const offsetY = (vh * scale - ch) / 2

  const sX = Math.max(0, (zoneX + offsetX) / scale)
  const sY = Math.max(0, (zoneY + offsetY) / scale)
  const sW = Math.min(vw - sX, zoneW / scale)
  const sH = Math.min(vh - sY, zoneH / scale)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sW)
  canvas.height = Math.round(sH)
  canvas.getContext('2d')!.drawImage(video, sX, sY, sW, sH, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      0.8,
    )
  })
}

/**
 * Cheap local pre-check: estimate the fraction of "strong edge" pixels in the
 * crop. A license plate (high-contrast characters) produces a high edge
 * density; an empty/uniform scene (blank wall, no vehicle) produces almost
 * none. This lets us skip the cloud API entirely when the frame is clearly
 * empty, saving API credits when staff press the button with nothing in view.
 *
 * NOTE: this can only reliably reject a *blank* frame. A busy scene with no
 * plate (e.g. an office, a face) still scores high — only the cloud engine can
 * confirm an actual plate. Tune EMPTY_EDGE_THRESHOLD for your camera using the
 * live "Signal" readout shown under the capture button.
 *
 * Returns a value in 0..1.
 */
function estimateEdgeDensity(srcCanvas: HTMLCanvasElement): number {
  // Downscale to a small fixed width for speed
  const targetW = 160
  const targetH = Math.max(1, Math.round((srcCanvas.height / srcCanvas.width) * targetW))
  const small = document.createElement('canvas')
  small.width = targetW
  small.height = targetH
  const ctx = small.getContext('2d')!
  ctx.drawImage(srcCanvas, 0, 0, targetW, targetH)

  const { data } = ctx.getImageData(0, 0, targetW, targetH)

  // Grayscale buffer
  const gray = new Float32Array(targetW * targetH)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  // Gradient magnitude (|gx| + |gy|); count pixels above an intensity step
  const EDGE_STEP = 36
  let edgeCount = 0
  let total = 0
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const i = y * targetW + x
      const gx = Math.abs(gray[i + 1] - gray[i - 1])
      const gy = Math.abs(gray[i + targetW] - gray[i - targetW])
      if (gx + gy > EDGE_STEP) edgeCount++
      total++
    }
  }
  return total > 0 ? edgeCount / total : 0
}

/** Frames below this edge density are treated as "empty" and never sent to the API. */
const EMPTY_EDGE_THRESHOLD = 0.04
/** Minimum delay between scan attempts to throttle cloud API usage. */
const SCAN_COOLDOWN_MS = 3000
/** How often to refresh the live local signal readout (ms). */
const SIGNAL_REFRESH_MS = 400

type ScanState = 'initializing' | 'ready' | 'scanning' | 'done' | 'error'

export function LicensePlateScanner({ onDetected, onCaptured, onClose }: LicensePlateScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef<number | null>(null)
  const didScanRef = useRef(false)   // guard: only one scan ever fires
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [state, setState] = useState<ScanState>('initializing')
  const [statusMsg, setStatusMsg] = useState('Starting camera...')
  const [detectedPlate, setDetectedPlate] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [cooldown, setCooldown] = useState(0)   // seconds remaining before next scan
  const [signal, setSignal] = useState(0)        // live local edge-density readout

  // ─── Overlay animation ────────────────────────────────────────────────────
  useEffect(() => {
    let running = true

    const draw = () => {
      if (!running) return
      const canvas = overlayRef.current
      if (!canvas) { animRef.current = requestAnimationFrame(draw); return }

      const ctx = canvas.getContext('2d')!
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      if (!w || !h) { animRef.current = requestAnimationFrame(draw); return }
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }

      ctx.clearRect(0, 0, w, h)

      const zW = Math.min(w * 0.85, 360)
      const zH = Math.min(h * 0.55, 220)
      const zX = (w - zW) / 2
      const zY = (h - zH) / 2

      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, w, h)
      ctx.clearRect(zX, zY, zW, zH)

      const color = detectedPlate ? '#22c55e' : '#3b82f6'
      ctx.strokeStyle = color
      ctx.lineWidth = 4
      const L = 30
      for (const [cx, cy, dx, dy] of [
        [zX, zY, 1, 1], [zX + zW, zY, -1, 1],
        [zX, zY + zH, 1, -1], [zX + zW, zY + zH, -1, -1],
      ] as [number, number, number, number][]) {
        ctx.beginPath()
        ctx.moveTo(cx + dx * L, cy)
        ctx.lineTo(cx, cy)
        ctx.lineTo(cx, cy + dy * L)
        ctx.stroke()
      }

      if (!detectedPlate) {
        const scanY = zY + ((Date.now() % 2000) / 2000) * zH
        const g = ctx.createLinearGradient(zX, scanY - 2, zX, scanY + 2)
        g.addColorStop(0, 'transparent')
        g.addColorStop(0.5, 'rgba(59,130,246,0.8)')
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.fillRect(zX, scanY - 2, zW, 4)
      }

      ctx.fillStyle = 'white'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Place license plate in frame', w / 2, zY - 12)

      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)
    return () => {
      running = false
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [detectedPlate])

  // ─── Camera init ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(async (stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        if (!cancelled) {
          setState('ready')
          setStatusMsg('Press the button below to scan')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setState('error')
        const msg = err instanceof Error ? err.message : String(err)
        setStatusMsg(
          msg.includes('Permission') || msg.includes('NotAllowed')
            ? 'Camera access denied. Please allow camera access in your browser.'
            : `Unable to start camera: ${msg}`,
        )
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  // ─── Live local signal sampler (free, no API) ─────────────────────────────
  useEffect(() => {
    if (state !== 'ready') return
    const id = setInterval(() => {
      const video = videoRef.current
      const overlay = overlayRef.current
      if (!video || !overlay || video.readyState < 2) return
      try {
        const canvas = cropFrameToCanvas(video, overlay)
        setSignal(estimateEdgeDensity(canvas))
      } catch {
        // ignore — camera not ready
      }
    }, SIGNAL_REFRESH_MS)
    return () => clearInterval(id)
  }, [state])

  // ─── Space key shortcut ───────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && state === 'ready' && cooldown === 0) {
        e.preventDefault()
        handleScan()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cooldown])

  // ─── Start a cooldown countdown that blocks further scans ──────────────────
  const startCooldown = () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    setCooldown(Math.ceil(SCAN_COOLDOWN_MS / 1000))
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          cooldownRef.current = null
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  // ─── Single scan ──────────────────────────────────────────────────────────
  const handleScan = async () => {
    if (didScanRef.current) return   // a scan is already running
    if (cooldown > 0) return         // throttled — ignore spam presses

    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay || video.readyState < 2) return

    // 1) Free local pre-check: is there anything plate-like in the frame?
    let canvas: HTMLCanvasElement
    try {
      canvas = cropFrameToCanvas(video, overlay)
    } catch {
      setStatusMsg('Camera not ready, please try again in a moment.')
      return
    }

    const edgeDensity = estimateEdgeDensity(canvas)
    if (edgeDensity < EMPTY_EDGE_THRESHOLD) {
      // Frame looks empty — do NOT call the cloud API. Apply cooldown to
      // discourage rapid repeated presses on an empty scene.
      setState('ready')
      setStatusMsg('No plate detected in frame — skipping, not calling service.')
      startCooldown()
      return
    }

    // 2) Looks like there's a plate — spend an API call.
    didScanRef.current = true
    setState('scanning')
    setStatusMsg('Recognizing...')

    try {
      const blob = await canvasToBlob(canvas)
      const result = await scanPlate(blob)

      if (result.plate) {
        setDetectedPlate(result.plate)
        setScore(result.score)
        setState('done')
        setStatusMsg(`Detected: ${result.plate}`)
        const imageUrl = URL.createObjectURL(blob)
        onCaptured?.(result.plate, blob, imageUrl)
        // Auto-fill immediately — Plate Recognizer confidence is always near-perfect
        onDetected(result.plate)
      } else {
        // API ran but found nothing — allow retry after cooldown
        didScanRef.current = false
        setState('ready')
        setStatusMsg('Plate not recognized. Adjust the camera angle and try again.')
        startCooldown()
      }
    } catch (err) {
      didScanRef.current = false
      setState('ready')
      const msg = err instanceof Error ? err.message : String(err)
      setStatusMsg(`Error: ${msg}. Please try again.`)
      startCooldown()
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔍</span>
            <span className="text-white font-semibold text-sm">Scan license plate</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Camera */}
        <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" />

          {state === 'initializing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-white text-sm">Starting camera...</p>
            </div>
          )}

          {state === 'scanning' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
              <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-white text-sm font-medium">Recognizing...</p>
            </div>
          )}

          {state === 'done' && detectedPlate && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <div className="bg-green-500 rounded-full p-3 mb-3">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-mono text-3xl font-bold tracking-widest">{detectedPlate}</p>
              <p className="text-green-300 text-sm mt-1">OCR: {Math.round(score * 100)}%</p>
            </div>
          )}

          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6">
              <span className="text-4xl mb-3">📵</span>
              <p className="text-white text-sm text-center">{statusMsg}</p>
            </div>
          )}
        </div>

        {/* Status + action */}
        <div className="px-4 py-3 bg-gray-900 border-t border-gray-700 space-y-3">
          <p className={`text-xs text-center ${
            state === 'done' ? 'text-green-400' :
            state === 'error' ? 'text-red-400' : 'text-gray-400'
          }`}>
            {statusMsg}
          </p>

          {(state === 'ready' || state === 'error') && (
            <button
              onClick={handleScan}
              disabled={state !== 'ready' || cooldown > 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              {cooldown > 0 ? (
                <>⏳ Please wait {cooldown}s</>
              ) : (
                <>
                  📸 Capture &amp; recognize plate
                  <span className="ml-2 text-blue-200 text-xs font-normal">[Space]</span>
                </>
              )}
            </button>
          )}

          {state === 'ready' && (
            <>
              {/* Live local signal — helps calibrate the empty-frame gate. */}
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span className="flex-shrink-0">Signal:</span>
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      signal >= EMPTY_EDGE_THRESHOLD ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                    style={{ width: `${Math.min(100, (signal / (EMPTY_EDGE_THRESHOLD * 3)) * 100)}%` }}
                  />
                </div>
                <span className="flex-shrink-0 font-mono w-20 text-right">
                  {(signal * 100).toFixed(1)}% / {(EMPTY_EDGE_THRESHOLD * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-gray-500 text-xs text-center">
                💡 {signal < EMPTY_EDGE_THRESHOLD
                  ? 'Frame is empty — bring the license plate into view to enable scanning.'
                  : 'Hold the camera steady with good lighting; the plate should fill most of the frame.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
