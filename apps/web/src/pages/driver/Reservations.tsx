import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  getMyReservations,
  createReservation,
  cancelReservation,
  type Reservation,
  type VehicleType,
} from '../../lib/driver-api'
import AppleDateTimePicker from '../../components/reservation/AppleDateTimePicker'
import DurationSelect, { type DurationValue } from '../../components/reservation/DurationSelect'

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
  const [searchParams] = useSearchParams()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill from query params (e.g. from landing page redirect)
  const paramVehicle = searchParams.get('vehicleType')
  const paramTime = searchParams.get('time')

  const [vehicleType, setVehicleType] = useState<VehicleType>(
    paramVehicle === 'car' || paramVehicle === 'motorbike' ? paramVehicle : 'car'
  )
  const [reservationDate, setReservationDate] = useState(() => {
    if (paramTime) {
      const parsed = new Date(paramTime)
      if (!isNaN(parsed.getTime()) && parsed > new Date()) return parsed
    }
    return new Date(Date.now() + 30 * 60 * 1000)
  })
  const [duration, setDuration] = useState<DurationValue>('2h')

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

  const handleCreate = async () => {
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
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:p-7">
          <div className="mb-6">
            <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
              Smart reservation
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-neutral-950 dark:text-white">
              Đặt chỗ mới
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Chọn loại xe, thời gian và thời lượng. Hệ thống sẽ tự động tìm slot phù hợp.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-3 text-[11px] font-mono uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                Loại xe
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setVehicleType('car')}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50 ${
                    vehicleType === 'car'
                      ? 'border-blue-500/40 bg-blue-50 dark:border-blue-300/30 dark:bg-blue-400/10'
                      : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="block text-[15px] font-semibold text-neutral-950 dark:text-white">Ô tô</span>
                  <span className="mt-1 block text-[12px] text-neutral-500 dark:text-neutral-400">Zone A tự động</span>
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setVehicleType('motorbike')}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50 ${
                    vehicleType === 'motorbike'
                      ? 'border-emerald-500/40 bg-emerald-50 dark:border-emerald-300/30 dark:bg-emerald-400/10'
                      : 'border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="block text-[15px] font-semibold text-neutral-950 dark:text-white">Xe máy</span>
                  <span className="mt-1 block text-[12px] text-neutral-500 dark:text-neutral-400">Zone B tự động</span>
                </button>
              </div>
            </div>

            <AppleDateTimePicker
              value={reservationDate}
              onChange={setReservationDate}
              minDate={new Date()}
              disabled={creating}
            />

            <DurationSelect value={duration} onChange={setDuration} disabled={creating} />

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-60"
            >
              {creating ? 'Đang tìm slot...' : 'Tìm slot phù hợp'}
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
