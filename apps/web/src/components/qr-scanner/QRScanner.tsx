import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  /** Called when a QR code is successfully scanned. */
  onScan: (decodedText: string) => void
  /** Called when the user closes the scanner. */
  onClose: () => void
}

/**
 * Task 22: QR Scanner modal component.
 * Uses html5-qrcode to access the device camera and decode QR codes.
 * Returns the decoded session UUID to the parent via onScan callback.
 *
 * Req 2.1, Design ref: QR scanning
 */
export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    const readerId = 'qr-reader-container'
    let mounted = true

    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode(readerId)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            // Successfully scanned — stop and notify parent
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
        if (mounted) {
          setStarting(false)
          setError(
            err instanceof Error
              ? err.message
              : 'Không thể truy cập camera. Vui lòng cấp quyền camera.',
          )
        }
      }
    }

    startScanner()

    return () => {
      mounted = false
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current.clear()
      }
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
                className="w-full aspect-square rounded-md overflow-hidden"
              />
              <p className="text-xs text-gray-500 text-center mt-3">
                Hướng camera vào mã QR trên vé/app của tài xế.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
