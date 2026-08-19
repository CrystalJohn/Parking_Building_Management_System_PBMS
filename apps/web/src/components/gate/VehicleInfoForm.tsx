import { useState, useEffect } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import InfoDisplayRow from './InfoDisplayRow'
import LaneMismatchBlocker from './LaneMismatchBlocker'
import ReservationQRButton, { type BookingData } from './ReservationQRButton'
import type {
  TicketType,
  UserType,
  VehicleFormData,
  VehicleFormErrors,
  VehicleType,
} from '../../types/vehicle'
import { normalizePlateForApi } from '../../lib/plate-format'

export interface CheckInData {
  plateNumber: string
  vehicleType: 'car' | 'motorbike'
  ticketType: 'hourly' | 'monthly' | 'reservation' | 'casual'
  userType: 'guest' | 'member' | 'registered'
  bookingCode?: string
}

export interface LaneInfo {
  laneId?: string
  laneName?: string
  vehicleType: 'car' | 'motorbike'
}

export interface VehicleInfoFormProps {
  // Data từ OCR
  ocrPlateNumber?: string
  ocrVehicleType?: 'car' | 'motorbike' | null

  // Data từ Lane Assignment
  laneInfo?: LaneInfo | null

  // Backward compatibility props
  initialData?: Partial<VehicleFormData>
  autoDetectedVehicleType?: 'car' | 'motorbike'
  ocrConfidence?: number
  laneVehicleType?: 'car' | 'motorbike'

  // Callbacks
  onConfirmCheckIn?: (data: CheckInData) => void
  onSubmit?: (data: VehicleFormData) => void
  onCancel?: () => void
  onRedirect?: () => void
  isLoading?: boolean
  submitButtonText?: string
  className?: string
}

export const VehicleInfoForm = ({
  ocrPlateNumber,
  ocrVehicleType: ocrVehicleTypeProp,
  laneInfo,
  initialData,
  autoDetectedVehicleType,
  ocrConfidence,
  laneVehicleType,
  onConfirmCheckIn,
  onSubmit,
  onCancel,
  onRedirect,
  isLoading = false,
  submitButtonText = '✅ XÁC NHẬN CHECK-IN',
  className = '',
}: VehicleInfoFormProps) => {
  const effectivePlateNumber =
    ocrPlateNumber ?? initialData?.plateNumber ?? ''
  const effectiveOcrVehicleType =
    ocrVehicleTypeProp !== undefined
      ? ocrVehicleTypeProp
      : autoDetectedVehicleType ?? null
  const effectiveLaneType: VehicleType =
    laneInfo?.vehicleType ?? laneVehicleType ?? initialData?.vehicleType ?? 'car'

  // State
  const [plateNumber, setPlateNumber] = useState(effectivePlateNumber)
  const [ticketType, setTicketType] = useState<TicketType>(
    initialData?.ticketType ?? (initialData?.reservationCode ? 'reservation' : 'casual'),
  )
  const [userType, setUserType] = useState<UserType>(
    initialData?.userType ?? 'guest',
  )
  const [bookingData, setBookingData] = useState<BookingData | null>(
    initialData?.reservationCode
      ? {
          bookingCode: initialData.reservationCode,
          plateNumber: effectivePlateNumber,
          vehicleType: effectiveLaneType,
          userType: 'member',
        }
      : null,
  )
  const [errors, setErrors] = useState<VehicleFormErrors>({})

  useEffect(() => {
    if (effectivePlateNumber) {
      setPlateNumber(effectivePlateNumber)
    }
  }, [effectivePlateNumber])

  useEffect(() => {
    if (initialData?.reservationCode) {
      setTicketType('reservation')
      setBookingData({
        bookingCode: initialData.reservationCode,
        plateNumber: initialData.plateNumber ?? plateNumber,
        vehicleType: effectiveLaneType,
        userType: 'member',
      })
    }
  }, [initialData?.reservationCode, effectiveLaneType, plateNumber])

  // Check lane mismatch
  const hasLaneMismatch =
    Boolean(effectiveOcrVehicleType) && effectiveOcrVehicleType !== effectiveLaneType

  // Handle QR scan success
  const handleReservationScan = (data: BookingData) => {
    setBookingData(data)
    if (data.plateNumber) {
      setPlateNumber(data.plateNumber)
    }
    setTicketType('reservation')
    setUserType(data.userType === 'member' ? 'registered' : 'guest')
  }

  // Block check-in nếu lane mismatch
  if (hasLaneMismatch && effectiveOcrVehicleType) {
    return (
      <LaneMismatchBlocker
        detectedType={effectiveOcrVehicleType}
        laneType={effectiveLaneType}
        onRedirect={onRedirect}
        onCancel={onCancel}
        className={className}
      />
    )
  }

  const validate = (): boolean => {
    const nextErrors: VehicleFormErrors = {}
    const normalizedPlate = normalizePlateForApi(plateNumber)

    if (!normalizedPlate || normalizedPlate.length < 4) {
      nextErrors.plateNumber = 'Biển số xe không hợp lệ (tối thiểu 4 ký tự).'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleConfirm = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!validate()) return

    const normalizedPlate = normalizePlateForApi(plateNumber)
    const bookingCode = bookingData?.bookingCode ?? initialData?.reservationCode

    if (onConfirmCheckIn) {
      onConfirmCheckIn({
        plateNumber: normalizedPlate,
        vehicleType: effectiveLaneType,
        ticketType: ticketType === 'reservation' ? 'reservation' : 'hourly',
        userType: userType === 'registered' ? 'member' : 'guest',
        bookingCode,
      })
    }

    if (onSubmit) {
      onSubmit({
        plateNumber: normalizedPlate,
        vehicleType: effectiveLaneType,
        ticketType,
        userType,
        reservationCode: bookingCode,
        autoDetectedVehicleType: effectiveOcrVehicleType ?? undefined,
        ocrConfidence,
      })
    }
  }

  // Xác định labels
  const vehicleTypeLabel = effectiveLaneType === 'car' ? 'Ô tô' : 'Xe máy'
  const vehicleTypeIcon = effectiveLaneType === 'car' ? '🚗' : '🛵'
  const ticketTypeLabel =
    ticketType === 'reservation' ? 'Đã đặt trước' : 'Vé lượt'
  const userTypeLabel =
    userType === 'registered' ? 'Đã đăng ký' : 'Khách'

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header & Nút Quét QR đặt trước */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <span>📋</span>
          <span>Thông tin Check-in phương tiện</span>
        </h3>
        <ReservationQRButton
          onScanSuccess={handleReservationScan}
          onScanError={(err) => console.error(err)}
          disabled={isLoading}
        />
      </div>

      {/* Biển số - EDITABLE */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-foreground">
            Biển số phương tiện{' '}
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              (có thể sửa)
            </span>
          </label>
        </div>
        <input
          type="text"
          value={plateNumber}
          onChange={(e) => {
            setPlateNumber(e.target.value.toUpperCase())
            if (errors.plateNumber) setErrors({})
          }}
          disabled={isLoading}
          className={`w-full rounded-xl border-2 bg-background px-4 py-3 font-mono text-lg font-bold uppercase tracking-wider transition-all focus:outline-none focus:ring-2 ${
            errors.plateNumber
              ? 'border-red-500 focus:ring-red-500/30'
              : 'border-blue-300 focus:border-blue-500 focus:ring-blue-200 dark:border-blue-800 dark:focus:border-blue-500'
          }`}
          placeholder="VD: 62B-145.709"
        />
        {errors.plateNumber && (
          <p className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
            <AlertCircle className="size-3.5" />
            {errors.plateNumber}
          </p>
        )}
      </div>

      {/* Các field READ-ONLY */}
      <div className="space-y-2">
        <InfoDisplayRow
          label="Loại xe"
          value={vehicleTypeLabel}
          icon={<span className="text-lg">{vehicleTypeIcon}</span>}
          source="từ Lane"
        />

        <InfoDisplayRow
          label="Loại vé"
          value={ticketTypeLabel}
          icon={<span className="text-lg">{ticketType === 'reservation' ? '📅' : '🎫'}</span>}
          source={bookingData ? 'từ QR' : 'auto'}
        />

        <InfoDisplayRow
          label="Người dùng"
          value={userTypeLabel}
          icon={<span className="text-lg">{userType === 'registered' ? '💳' : '👤'}</span>}
          source={bookingData ? 'từ QR' : 'auto'}
        />

        {/* Hiển thị thêm info nếu có booking */}
        {bookingData && (
          <>
            <InfoDisplayRow
              label="Mã đặt chỗ"
              value={bookingData.bookingCode}
              icon={<span className="text-lg">🔖</span>}
              source="từ QR"
            />
            {bookingData.slotReserved && (
              <InfoDisplayRow
                label="Vị trí đặt"
                value={bookingData.slotReserved}
                icon={<span className="text-lg">📍</span>}
                source="từ QR"
              />
            )}
          </>
        )}
      </div>

      {/* Nút xác nhận */}
      <div className="space-y-2 pt-2">
        <Button
          type="button"
          onClick={() => handleConfirm()}
          disabled={!plateNumber.trim() || isLoading}
          className="w-full gap-2 rounded-xl bg-green-600 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              Đang Check-in...
            </>
          ) : (
            submitButtonText
          )}
        </Button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Hủy
          </button>
        )}
      </div>
    </div>
  )
}

export default VehicleInfoForm
