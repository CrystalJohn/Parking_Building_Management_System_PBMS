import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

interface QRScannerProps {
  /** Called when a QR code is successfully scanned. */
  onScan: (decodedText: string) => void
  /** Called when the user closes the scanner. */
  onClose: () => void
  /** Optional: called when the user submits a session ID manually. */
  onManualInput?: (sessionId: string) => void
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
  return 'Không thể truy cập camera. Vui lòng cấp quyền camera trong trình duyệt.'
}

/**
 * Task 22: QR Scanner modal component.
 * Uses html5-qrcode to access the device camera and decode QR codes.
 * Returns the decoded session UUID to the parent via onScan callback.
 *
 * Req 2.1, Design ref: QR scanning
 */
export function QRScanner({ onScan, onClose, onManualInput }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scannedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)
  const [manualInput, setManualInput] = useState('')
  const [showManual, setShowManual] = useState(false)

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
            'Trình duyệt không hỗ trợ camera. Hãy mở qua HTTPS hoặc localhost.',
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
            // Increase decode attempts per second for faster recognition.
            fps: 20,
            // Smaller scan box = less noise = faster decode.
            qrbox: (vw, vh) => {
              const min = Math.min(vw, vh)
              const size = Math.floor(min * 0.6)
              return { width: size, height: size }
            },
            // Keep 1:1 so the container and video stream match — avoids the
            // "double frame" artifact that appears when native ratio (16:9 or
            // 9:16) doesn't match the square CSS container.
            aspectRatio: 1,
            // Rear camera doesn't need flip processing.
            disableFlip: true,
            // Request a square-ish HD stream so the browser picks a
            // resolution close to 720×720 instead of falling back to VGA.
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 720 },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Quét mã QR"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Quét mã QR</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Đóng"
          >
            &times;
          </button>
        </div>

        <div className="p-4">
          {error ? (
            <div className="text-center py-8">
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <button onClick={onClose} className="btn-secondary">
                Đóng
              </button>
            </div>
          ) : (
            <>
              {starting && (
                <p className="text-center text-sm text-gray-500 mb-2">
                  Đang khởi động camera...
                </p>
              )}
              <div
                id="qr-reader-container"
                ref={containerRef}
                className="w-full aspect-square rounded-md overflow-hidden bg-black"
              />
              <p className="text-xs text-gray-500 text-center mt-3">
                Đặt mã QR cách camera 15-25cm, giữ thẳng và đủ sáng.
              </p>
              {onManualInput && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  {!showManual ? (
                    <button
                      type="button"
                      onClick={() => setShowManual(true)}
                      className="text-sm text-primary-600 hover:underline w-full text-center"
                    >
                      Camera không quét được? Nhập mã thủ công
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-xs text-gray-600">
                        Nhập session ID (UUID từ QR)
                      </label>
                      <input
                        type="text"
                        className="input text-xs font-mono"
                        placeholder="VD: 5f3a9c1e-..."
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = manualInput.trim()
                            if (trimmed) onManualInput(trimmed)
                          }}
                          className="btn-primary text-sm flex-1"
                          disabled={!manualInput.trim()}
                        >
                          Xác nhận
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowManual(false)
                            setManualInput('')
                          }}
                          className="btn-secondary text-sm"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
