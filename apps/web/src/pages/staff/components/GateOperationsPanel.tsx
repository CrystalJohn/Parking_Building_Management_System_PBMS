import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InfoRow, Section, Spinner } from '@/components/ui'
import { useCheckIn } from '../hooks/useCheckIn'

// === TYPES ===
type CheckInPrefill = {
  type: 'qr' | 'plate'
  value: string
}

type Props = {
  prefill: CheckInPrefill
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
  onDone: () => void
  onCancel: () => void
}

// === HELPERS ===
function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    return axiosErr.response?.data?.message ?? 'Có lỗi xảy ra khi check-in'
  }
  if (err instanceof Error) return err.message
  return 'Có lỗi xảy ra khi check-in'
}

// === COMPONENT ===
export function GateOperationsPanel({ prefill, vehicle, reservation, onDone, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null)
  const checkIn = useCheckIn()

  const displayPlate = vehicle?.plate ?? prefill.value
  const displayVehicleType: 'car' | 'motorbike' =
    vehicle?.type === 'car' || vehicle?.type === 'motorbike' ? vehicle.type : 'car'

  const handleCheckIn = async () => {
    setError(null)
    try {
      await checkIn.mutateAsync({
        plate: displayPlate,
        reservationId: reservation?.id,
        vehicleType: displayVehicleType,
      })
      onDone()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">Check-in</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Thông tin xe */}
        <Section title="Thông tin xe">
          <InfoRow label="Biển số" value={displayPlate} highlight />
          <InfoRow
            label="Loại xe"
            value={displayVehicleType === 'car' ? 'Ô tô' : 'Xe máy'}
          />
        </Section>

        {/* Thông tin đặt chỗ (nếu có) */}
        {reservation && (
          <Section title="Thông tin đặt chỗ">
            <InfoRow label="Mã đặt chỗ" value={reservation.id} />
            <InfoRow label="Slot" value={reservation.slotCode} highlight />
            <InfoRow label="Từ" value={formatDateTime(reservation.startTime)} />
            <InfoRow label="Đến" value={formatDateTime(reservation.endTime)} />
          </Section>
        )}

        {/* Error message */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex justify-between gap-2">
        <Button variant="outline" onClick={onCancel} disabled={checkIn.isPending}>
          ← Quét xe khác
        </Button>
        <Button onClick={handleCheckIn} disabled={checkIn.isPending}>
          {checkIn.isPending && <Spinner className="mr-2" />}
          Xác nhận Check-in
        </Button>
      </CardFooter>
    </Card>
  )
}
