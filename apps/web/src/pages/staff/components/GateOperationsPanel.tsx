import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DualCapturePanel, type CapturedOverviewData, type CapturedPlateData } from '../../../components/camera'
import { VehicleInfoForm } from '../../../components/vehicle-info'
import { useCheckIn } from '../hooks/useCheckIn'
import type { VehicleFormData, VehicleType } from '../../../types/vehicle'
import type { CheckInResponse } from '../../../lib/sessions-api'

// === TYPES ===
export type CheckInPrefill = {
  type: 'qr' | 'plate'
  value: string
}

export interface CheckInSuccessResult {
  ticketCode: string
  plateNumber: string
  vehicleType: VehicleType
  slotCode: string
  checkInTime: string
  hourlyRate: number
  sessionId: string
}

export interface GateOperationsPanelProps {
  prefill?: CheckInPrefill
  vehicle?: {
    plate: string
    type: 'car' | 'motorbike'
  }
  reservation?: {
    id: string
    slotCode: string
    startTime: string
    endTime: string
  }
  laneVehicleType?: 'car' | 'motorbike'
  initialPlateImage?: CapturedPlateData | null
  onSuccess?: (result: CheckInSuccessResult) => void
  onDone: () => void
  onCancel: () => void
  autoDetectedVehicleType?: 'car' | 'motorbike'
  ocrConfidence?: number
  className?: string
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    return axiosErr.response?.data?.message ?? 'Có lỗi xảy ra khi check-in.'
  }
  if (err instanceof Error) return err.message
  return 'Có lỗi xảy ra khi check-in.'
}

export function GateOperationsPanel({
  prefill,
  vehicle,
  reservation,
  laneVehicleType,
  initialPlateImage,
  onSuccess,
  onDone,
  onCancel,
  autoDetectedVehicleType,
  ocrConfidence,
  className = '',
}: GateOperationsPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [plateImage, setPlateImage] = useState<CapturedPlateData | null>(initialPlateImage ?? null)
  const [overviewImage, setOverviewImage] = useState<CapturedOverviewData | null>(null)

  const checkInMutation = useCheckIn()

  const initialPlate =
    vehicle?.plate ??
    (prefill?.type === 'plate' ? prefill.value : '')

  const initialVehicleType: VehicleType =
    vehicle?.type ??
    autoDetectedVehicleType ??
    laneVehicleType ??
    'car'

  const handleFormSubmit = async (formData: VehicleFormData) => {
    setError(null)
    try {
      const response: CheckInResponse = await checkInMutation.mutateAsync({
        plate: formData.plateNumber,
        reservationId:
          formData.ticketType === 'reservation'
            ? formData.reservationCode || reservation?.id
            : undefined,
        vehicleType: formData.vehicleType,
      })

      const ticketCode =
        response.ticket?.sessionCode ??
        (response.session as unknown as { sessionCode?: string })?.sessionCode ??
        `TKT-${response.session.id.slice(-6).toUpperCase()}`

      const result: CheckInSuccessResult = {
        ticketCode,
        plateNumber: response.session.plateDisplay ?? response.session.licensePlate ?? formData.plateNumber,
        vehicleType: (response.session.vehicleType as VehicleType) ?? formData.vehicleType,
        slotCode: response.slot?.code ?? response.ticket?.slotCode ?? '—',
        checkInTime: response.session.checkInTime ?? new Date().toISOString(),
        hourlyRate: formData.vehicleType === 'car' ? 20000 : 5000,
        sessionId: response.session.id,
      }

      if (onSuccess) {
        onSuccess(result)
      } else {
        onDone()
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handlePlateCaptured = (data: CapturedPlateData) => {
    setPlateImage(data)
  }

  return (
    <div className={`mx-auto w-full max-w-5xl space-y-4 ${className}`}>
      {/* Top Header / Navigation */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Quay lại tra cứu
        </Button>
        <span className="text-xs font-medium text-muted-foreground">
          Check-in xe vào cổng
        </span>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main 2-Column Responsive Dashboard Layout */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Left Column (5 Cols): Hình ảnh camera giám sát */}
        <div className="space-y-3 lg:col-span-5">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-foreground">
              Hình ảnh đối chứng (2 góc chụp)
            </h3>
            <DualCapturePanel
              plateImage={plateImage}
              overviewImage={overviewImage}
              onPlateCaptured={handlePlateCaptured}
              onOverviewCaptured={setOverviewImage}
              disabled={checkInMutation.isPending}
            />
          </div>

          <div className="rounded-xl border border-blue-200/60 bg-blue-50/50 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
            💡 <strong>Lưu ý:</strong> Ảnh biển số và ảnh toàn cảnh sẽ được đính kèm vào phiên gửi xe để đối soát an ninh lúc check-out.
          </div>
        </div>

        {/* Right Column (7 Cols): Form thông tin phương tiện */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <VehicleInfoForm
              key={`${plateImage?.plateNumber || initialPlate}-${initialVehicleType}`}
              ocrPlateNumber={plateImage?.plateNumber || initialPlate}
              ocrVehicleType={autoDetectedVehicleType ?? null}
              laneInfo={{
                vehicleType: laneVehicleType ?? 'car',
              }}
              initialData={{
                plateNumber: plateImage?.plateNumber || initialPlate,
                vehicleType: initialVehicleType,
                ticketType: reservation ? 'reservation' : 'casual',
                reservationCode: reservation?.id,
              }}
              autoDetectedVehicleType={autoDetectedVehicleType}
              ocrConfidence={ocrConfidence}
              laneVehicleType={laneVehicleType}
              onConfirmCheckIn={(checkInData) => {
                void handleFormSubmit({
                  plateNumber: checkInData.plateNumber,
                  vehicleType: checkInData.vehicleType,
                  ticketType: checkInData.ticketType === 'reservation' ? 'reservation' : 'casual',
                  userType: checkInData.userType === 'member' ? 'registered' : 'guest',
                  reservationCode: checkInData.bookingCode,
                })
              }}
              onSubmit={handleFormSubmit}
              onCancel={onCancel}
              isLoading={checkInMutation.isPending}
              submitButtonText="✅ XÁC NHẬN CHECK-IN"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Alias CheckInPanel for convenience
export const CheckInPanel = GateOperationsPanel
