import { useState } from 'react'
import { QrCode, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { QRScanner } from '../qr-scanner/QRScanner'
import { scanReservationCheckIn } from '../../lib/sessions-api'

export interface BookingData {
  bookingCode: string
  plateNumber: string
  vehicleType: 'car' | 'motorbike'
  userType: 'member' | 'guest'
  userName?: string
  slotReserved?: string
}

export interface ReservationQRButtonProps {
  onScanSuccess: (bookingData: BookingData) => void
  onScanError?: (error: string) => void
  disabled?: boolean
  className?: string
}

export const ReservationQRButton = ({
  onScanSuccess,
  onScanError,
  disabled = false,
  className = '',
}: ReservationQRButtonProps) => {
  const [isScanning, setIsScanning] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleScan = (decodedText: string) => {
    setIsScanning(false)
    const token = decodedText.trim()
    if (!token) return

    setIsProcessing(true)
    void scanReservationCheckIn(token)
      .then((res) => {
        onScanSuccess({
          bookingCode: res.reservationId,
          plateNumber: res.plateDisplay ?? res.plateNumber,
          vehicleType: res.vehicleType,
          userType: 'member',
          slotReserved: res.slotCode,
        })
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : 'Mã QR đặt trước không hợp lệ hoặc đã hết hạn.'
        onScanError?.(msg)
      })
      .finally(() => {
        setIsProcessing(false)
      })
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setIsScanning(true)}
        disabled={disabled || isScanning || isProcessing}
        className={`flex items-center gap-2 bg-purple-600 px-4 py-2 font-semibold text-white shadow-sm transition-all hover:bg-purple-700 disabled:opacity-50 ${className}`}
      >
        {isProcessing ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Đang xác thực...
          </>
        ) : (
          <>
            <QrCode className="size-4" />
            Quét QR đặt trước
          </>
        )}
      </Button>

      {isScanning && (
        <QRScanner
          onScan={handleScan}
          onManualInput={handleScan}
          onClose={() => setIsScanning(false)}
          title="Quét mã QR đặt chỗ"
          instructions="Đưa mã QR trên app của khách vào khung hình để nhận diện thông tin đặt chỗ."
        />
      )}
    </>
  )
}

export default ReservationQRButton
