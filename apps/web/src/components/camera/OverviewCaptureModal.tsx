import { useEffect, useState } from 'react'
import { Camera, Loader2, RefreshCw, X } from 'lucide-react'
import { useSimpleCapture } from '../../hooks/useSimpleCapture'
import { Button } from '../ui/button'

export interface OverviewCaptureModalProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (blob: Blob, dataUrl: string) => void
  title?: string
  description?: string
}

export function OverviewCaptureModal({
  isOpen,
  onClose,
  onCapture,
  title = 'Chụp ảnh tổng quan xe',
  description = 'Căn chỉnh camera để ghi lại toàn cảnh xe và làn vào/ra.',
}: OverviewCaptureModalProps) {
  const {
    videoRef,
    isStreaming,
    isLoading,
    error,
    startCamera,
    stopCamera,
    captureFrame,
  } = useSimpleCapture()

  const [isCapturing, setIsCapturing] = useState(false)

  // Start / Stop camera based on modal open state
  useEffect(() => {
    if (isOpen) {
      void startCamera()
    } else {
      stopCamera()
    }
  }, [isOpen, startCamera, stopCamera])

  // Handle Space key shortcut to capture
  useEffect(() => {
    if (!isOpen || !isStreaming || isCapturing) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        void handleCapture()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isStreaming, isCapturing, onClose])

  const handleCapture = async () => {
    if (!isStreaming || isCapturing) return
    setIsCapturing(true)
    try {
      const result = await captureFrame()
      if (result) {
        onCapture(result.blob, result.dataUrl)
        onClose()
      }
    } finally {
      setIsCapturing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-gray-900 shadow-2xl border border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 bg-gray-800/80">
          <div className="flex items-center gap-2">
            <Camera className="size-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Camera Viewfinder */}
        <div className="relative aspect-video w-full bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            autoPlay
            muted
          />

          {/* Guidelines Overlay */}
          {isStreaming && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="h-full w-full rounded-lg border-2 border-dashed border-white/30" />
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75">
              <Loader2 className="mb-3 size-9 animate-spin text-blue-500" />
              <p className="text-sm font-medium text-white">Đang khởi động camera...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center">
              <p className="mb-4 text-sm text-red-400">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void startCamera()}
                className="gap-2 border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
              >
                <RefreshCw className="size-4" />
                Thử lại
              </Button>
            </div>
          )}
        </div>

        {/* Footer & Controls */}
        <div className="space-y-3 border-t border-gray-800 bg-gray-900 p-4">
          <p className="text-center text-xs text-gray-400">{description}</p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-1/3 border-gray-700 bg-transparent text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Hủy
            </Button>

            <Button
              type="button"
              onClick={handleCapture}
              disabled={!isStreaming || isCapturing}
              className="flex-1 gap-2 bg-blue-600 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {isCapturing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              Chụp ảnh
              <span className="hidden text-xs font-normal text-blue-200 sm:inline">
                [Space]
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
