import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  getMyReservations,
  createReservation,
  cancelReservation,
  type Reservation,
  type VehicleType,
} from '../../lib/driver-api'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  active: { text: 'Đang giữ', color: 'bg-green-100 text-green-800' },
  fulfilled: { text: 'Đã sử dụng', color: 'bg-blue-100 text-blue-800' },
  expired: { text: 'Hết hạn', color: 'bg-gray-100 text-gray-600' },
  cancelled: { text: 'Đã hủy', color: 'bg-red-100 text-red-700' },
}

/**
 * 23.2: Driver Reservations — create/cancel/list reservations.
 * Req 8.5
 */
export default function Reservations() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadReservations()
  }, [])

  const loadReservations = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getMyReservations()
      setReservations(data)
    } catch {
      setError('Không thể tải danh sách đặt chỗ')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (vehicleType: VehicleType) => {
    setCreating(true)
    setError(null)
    try {
      await createReservation(vehicleType)
      await loadReservations()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        setError(typeof msg === 'string' ? msg : 'Không thể đặt chỗ')
      } else {
        setError('Lỗi không xác định')
      }
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Bạn có chắc muốn hủy đặt chỗ này?')) return
    try {
      await cancelReservation(id)
      await loadReservations()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        setError(typeof msg === 'string' ? msg : 'Không thể hủy')
      }
    }
  }

  const activeReservations = reservations.filter((r) => r.status === 'active')
  const pastReservations = reservations.filter((r) => r.status !== 'active')

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Đặt chỗ trước</h1>
          <p className="text-sm text-gray-500">
            Giữ chỗ trong 30 phút. Đến cổng check-in trước khi hết hạn.
          </p>
        </header>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md p-2">
            {error}
          </p>
        )}

        {/* Create reservation */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Đặt chỗ mới</h2>
          <div className="flex gap-3">
            <button
              onClick={() => handleCreate('car')}
              disabled={creating}
              className="btn-primary flex-1"
            >
              {creating ? 'Đang đặt...' : 'Đặt chỗ Ô tô'}
            </button>
            <button
              onClick={() => handleCreate('motorbike')}
              disabled={creating}
              className="btn-secondary flex-1"
            >
              {creating ? 'Đang đặt...' : 'Đặt chỗ Xe máy'}
            </button>
          </div>
        </div>

        {loading && <p className="text-gray-500">Đang tải...</p>}

        {/* Active reservations */}
        {activeReservations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Đang giữ chỗ</h2>
            {activeReservations.map((r) => (
              <ReservationCard key={r.id} reservation={r} onCancel={handleCancel} />
            ))}
          </div>
        )}

        {/* Past reservations */}
        {pastReservations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-600">Lịch sử đặt chỗ</h2>
            {pastReservations.map((r) => (
              <ReservationCard key={r.id} reservation={r} />
            ))}
          </div>
        )}

        {!loading && reservations.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">
            Chưa có lịch sử đặt chỗ.
          </p>
        )}
      </div>
    </div>
  )
}

function ReservationCard({
  reservation,
  onCancel,
}: {
  reservation: Reservation
  onCancel?: (id: string) => void
}) {
  const status = STATUS_LABELS[reservation.status] ?? STATUS_LABELS.active
  const isActive = reservation.status === 'active'

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold">{reservation.slot.code}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
              {status.text}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {reservation.vehicleType === 'car' ? 'Ô tô' : 'Xe máy'} —{' '}
            {reservation.slot.floor.name}
          </p>
          <p className="text-xs text-gray-500">
            Đặt lúc: {formatDateTime(reservation.createdAt)}
          </p>
          {isActive && (
            <Countdown expiresAt={reservation.expiresAt} />
          )}
        </div>

        {isActive && onCancel && (
          <button
            onClick={() => onCancel(reservation.id)}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Hủy
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Live countdown timer that updates every second.
 * Shows remaining time in mm:ss format.
 * Turns red when < 5 minutes remaining.
 */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt))

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(calcRemaining(expiresAt))
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  if (remaining <= 0) {
    return (
      <p className="text-xs text-red-600 font-bold">
        ⏰ Đã hết hạn
      </p>
    )
  }

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const isUrgent = minutes < 5

  return (
    <div className={`flex items-center gap-2 ${isUrgent ? 'text-red-600' : 'text-gray-700'}`}>
      <span className="text-xs">⏱ Còn lại:</span>
      <span className={`font-mono text-sm font-bold ${isUrgent ? 'animate-pulse' : ''}`}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  )
}

function calcRemaining(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.floor(diff / 1000))
}
