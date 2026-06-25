import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

interface QRScannerProps {
  /** Called when a QR code is successfully scanned. */
  onScan: (decodedText: string) => void
  /** Called when the user closes the scanner. */
  onClose: () => void
  /** Optional: called when the user submits a QR payload manually. */
  onManualInput?: (value: string) => void
  title?: string
  instructions?: string
  manualToggleLabel?: string
  manualInputLabel?: string
  manualInputPlaceholder?: string
}

/**
 * Extract a human-readable message from any error value.
 * html5-qrcode sometimes throws strings or empty errors.
 */
function describeError(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const maybeMsg = (err as { message?: unknown }).message
    if (typeof maybeMsg === 'string' && maybeMsg) return maybeMsg
  }
  return 'Cannot access camera. Please grant camera permission in your browser.'
}

/**
 * Task 22: QR Scanner modal component.
 * Uses html5-qrcode to access the device camera and decode QR codes.
 * Returns the decoded session UUID to the parent via onScan callback.
 *
 * Req 2.1, Design ref: QR scanning
 */
export function QRScanner({
  onScan,
  onClose,
  onManualInput,
  title = 'Scan QR code',
  instructions = 'Hold QR code 15-25cm from camera, keep it straight and well-lit.',
  manualToggleLabel = 'Cannot scan? Enter code manually',
  manualInputLabel = 'Enter session ID (UUID from QR)',
  manualInputPlaceholder = 'e.g. 5f3a9c1e-...',
}: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scannedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [manualInput, setManualInput] = useState('')

  useEffect(() => {
    const readerId = 'qr-reader-container'
    let mounted = true

    const startScanner = async () => {
      try {
        // Browsers only allow camera over HTTPS or localhost. Surface a clear
        // message instead of a cryptic getUserMedia error.
        if (
          typeof navigator === 'undefined' ||
          !navigator.mediaDevices?.getUserMedia
        ) {
          throw new Error(
            'Browser does not support camera. Please open via HTTPS or localhost.',
          )
        }

        const scanner = new Html5Qrcode(readerId, {
          // Restrict to QR codes for faster decoding and fewer false positives.
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        })
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            // Keep decode attempts steady without overloading low-end devices.
            fps: 15,
            // Use a generous scan box for ticket screens, glare, and angled scans.
            qrbox: (vw, vh) => {
              const min = Math.min(vw, vh)
              const size = Math.floor(Math.min(Math.max(min * 0.78, 240), 420))
              return { width: size, height: size }
            },
            aspectRatio: 16 / 9,
            // Allow mirrored decoding as a fallback if the browser picks a mirrored stream.
            disableFlip: false,
            // Prefer HD video so small QR codes remain readable.
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (decodedText) => {
            // Guard against multiple scans firing before stop() resolves
            if (scannedRef.current) return
            scannedRef.current = true
            // Stop asynchronously; ignore errors (already handled in cleanup)
            scanner.stop().catch(() => {})
            if (mounted) {
              onScan(decodedText)
            }
          },
          () => {
            // QR code not detected in this frame — ignore
          },
        )

        if (mounted) setStarting(false)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[QRScanner] start failed', err)
        if (mounted) {
          setStarting(false)
          setError(describeError(err))
        }
      }
    }

    startScanner()

    return () => {
      mounted = false
      const scanner = scannerRef.current
      scannerRef.current = null
      if (!scanner) return

      // stop() must complete before clear(); otherwise html5-qrcode throws.
      // Errors from stop()/clear() during unmount are non-fatal.
      void (async () => {
        try {
          await scanner.stop()
        } catch {
          /* ignore — scanner may already be stopped */
        }
        try {
          scanner.clear()
        } catch {
          /* ignore */
        }
      })()
    }
  }, [onScan])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/35 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-black text-slate-950">{title}</h3>
            <p className="text-xs font-semibold text-slate-500">Keep the QR flat, bright, and inside the guide frame.</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl text-2xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
            </div>
          ) : (
            <>
              {starting && (
                <p className="text-center text-sm text-gray-500 mb-2">
                  Starting camera...
                </p>
              )}
              <div
                id="qr-reader-container"
                ref={containerRef}
                className="relative aspect-video w-full overflow-hidden rounded-xl bg-primary-50 ring-1 ring-primary-100 [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
              />
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-500">
                {instructions}
              </p>
              {onManualInput && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <label className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      {manualInputLabel}
                    </label>
                    <span className="text-xs font-semibold text-primary-600">{manualToggleLabel}</span>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      className="input h-11 font-mono text-sm font-black uppercase tracking-[0.08em]"
                      placeholder={manualInputPlaceholder}
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = manualInput.trim()
                        if (trimmed) onManualInput(trimmed)
                      }}
                      className="btn-primary h-11 rounded-xl px-5 text-sm"
                      disabled={!manualInput.trim()}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
