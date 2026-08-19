import { useState } from 'react'
import { CapturedThumbnail } from './CapturedThumbnail'
import { OverviewCaptureModal } from './OverviewCaptureModal'
import { LicensePlateScanner } from '../plate-scanner/LicensePlateScanner'

export interface CapturedPlateData {
  blob: Blob
  dataUrl: string
  plateNumber: string
}

export interface CapturedOverviewData {
  blob: Blob
  dataUrl: string
}

export interface DualCapturePanelProps {
  /** Captured plate data (controlled or initial) */
  plateImage?: CapturedPlateData | null
  /** Captured overview scene data (controlled or initial) */
  overviewImage?: CapturedOverviewData | null
  /** Callback fired when license plate is scanned and captured */
  onPlateCaptured?: (data: CapturedPlateData) => void
  /** Callback fired when vehicle overview photo is captured */
  onOverviewCaptured?: (data: CapturedOverviewData) => void
  /** Callback when user requests to retake the license plate */
  onPlateRetake?: () => void
  /** Callback when user requests to retake the overview photo */
  onOverviewRetake?: () => void
  /** Automatically open overview modal after successful plate OCR */
  autoPromptOverview?: boolean
  disabled?: boolean
  className?: string
}

export function DualCapturePanel({
  plateImage: externalPlate,
  overviewImage: externalOverview,
  onPlateCaptured,
  onOverviewCaptured,
  onPlateRetake,
  onOverviewRetake,
  autoPromptOverview = true,
  disabled = false,
  className = '',
}: DualCapturePanelProps) {
  // Internal state for uncontrolled usage or state caching
  const [internalPlate, setInternalPlate] = useState<CapturedPlateData | null>(null)
  const [internalOverview, setInternalOverview] = useState<CapturedOverviewData | null>(null)

  const [isPlateScannerOpen, setIsPlateScannerOpen] = useState(false)
  const [isOverviewModalOpen, setIsOverviewModalOpen] = useState(false)

  const currentPlate = externalPlate !== undefined ? externalPlate : internalPlate
  const currentOverview = externalOverview !== undefined ? externalOverview : internalOverview

  const handlePlateCaptured = (plate: string, blob: Blob, dataUrl: string) => {
    const data: CapturedPlateData = { blob, dataUrl, plateNumber: plate }
    setInternalPlate(data)
    onPlateCaptured?.(data)
    setIsPlateScannerOpen(false)

    // Sequential flow: if overview is not yet captured, prompt overview modal
    if (autoPromptOverview && !currentOverview) {
      setTimeout(() => {
        setIsOverviewModalOpen(true)
      }, 300)
    }
  }

  const handleOverviewCaptured = (blob: Blob, dataUrl: string) => {
    const data: CapturedOverviewData = { blob, dataUrl }
    setInternalOverview(data)
    onOverviewCaptured?.(data)
    setIsOverviewModalOpen(false)
  }

  const handlePlateRetake = () => {
    setInternalPlate(null)
    onPlateRetake?.()
    setIsPlateScannerOpen(true)
  }

  const handleOverviewRetake = () => {
    setInternalOverview(null)
    onOverviewRetake?.()
    setIsOverviewModalOpen(true)
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 2-Column Grid of Thumbnails */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* 1. License Plate Photo Card */}
        <CapturedThumbnail
          label="1. Ảnh biển số (OCR)"
          imageUrl={currentPlate?.dataUrl}
          plateNumber={currentPlate?.plateNumber}
          status={currentPlate ? 'captured' : 'not_captured'}
          description="Chụp cận cảnh biển số xe để nhận diện OCR"
          onCapture={() => setIsPlateScannerOpen(true)}
          onRetake={handlePlateRetake}
          disabled={disabled}
        />

        {/* 2. Vehicle Overview Photo Card */}
        <CapturedThumbnail
          label="2. Ảnh toàn cảnh xe"
          imageUrl={currentOverview?.dataUrl}
          status={currentOverview ? 'captured' : 'not_captured'}
          description="Chụp toàn cảnh phương tiện và làn xe"
          onCapture={() => setIsOverviewModalOpen(true)}
          onRetake={handleOverviewRetake}
          disabled={disabled}
        />
      </div>

      {/* License Plate Scanner Modal */}
      {isPlateScannerOpen && (
        <LicensePlateScanner
          onDetected={(_plate) => {
            // Handled by onCaptured
          }}
          onCaptured={handlePlateCaptured}
          onClose={() => setIsPlateScannerOpen(false)}
        />
      )}

      {/* Vehicle Overview Capture Modal */}
      <OverviewCaptureModal
        isOpen={isOverviewModalOpen}
        onClose={() => setIsOverviewModalOpen(false)}
        onCapture={handleOverviewCaptured}
        title="Chụp ảnh toàn cảnh xe"
        description="Đảm bảo nhìn rõ toàn cảnh xe và làn cổng để lưu trữ hồ sơ."
      />
    </div>
  )
}
