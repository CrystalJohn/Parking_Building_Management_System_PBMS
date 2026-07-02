import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  getMyReservations,
  getMyVehicles,
  createReservation,
  cancelReservation,
  type DriverVehicle,
  type Reservation,
} from '../../lib/driver-api'
import { formatDateTimeVN } from '../../lib/date-time'

const formatDateTime = formatDateTimeVN

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  active: { text: 'Active', color: 'bg-green-100 text-green-800' },
  fulfilled: { text: 'Fulfilled', color: 'bg-blue-100 text-blue-800' },
  expired: { text: 'Expired', color: 'bg-gray-100 text-gray-600' },
  cancelled: { text: 'Cancelled', color: 'bg-red-100 text-red-700' },
}

export default function Reservations() {
  const [searchParams] = useSearchParams()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const paramVehicle = searchParams.get('vehicleId')

  useEffect(() => {
    void loadPage()
  }, [])

  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ??
    vehicles.find((vehicle) => vehicle.id === paramVehicle) ??
    vehicles[0] ??
    null

  useEffect(() => {
    if (!selectedVehicleId && selectedVehicle?.id) {
      setSelectedVehicleId(selectedVehicle.id)
    }
  }, [selectedVehicle?.id, selectedVehicleId])

  const loadPage = async () => {
    setLoading(true)
    setError(null)
    try {
      const [vehicleData, reservationData] = await Promise.all([
        getMyVehicles(),
        getMyReservations(),
      ])
      setVehicles(vehicleData)
      setReservations(reservationData)
    } catch {
      setError('Unable to load reservation data')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!selectedVehicle) {
      setError('A linked vehicle is required before creating a reservation')
      return
    }

    setCreating(true)
    setError(null)
    try {
      await createReservation(selectedVehicle.id)
      await loadPage()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        setError(typeof msg === 'string' ? msg : 'Unable to reserve slot')
      } else {
        setError('Unknown error')
      }
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this reservation?')) return
    try {
      await cancelReservation(id)
      await loadPage()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        setError(typeof msg === 'string' ? msg : 'Unable to cancel')
      }
    }
  }

  const activeReservations = reservations.filter((r) => r.status === 'active')
  const pastReservations = reservations.filter((r) => r.status !== 'active')

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Reserve a slot</h1>
          <p className="text-sm text-gray-500">
            Pick a linked vehicle first. Staff QR check-in uses that vehicle record directly.
          </p>
        </header>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-blue-600">
              Linked vehicle
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-neutral-950">
              New reservation
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              The system assigns the best slot based on the linked vehicle you choose.
            </p>
          </div>

          {!loading && vehicles.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              No linked vehicles found. Link a vehicle to your driver account before reserving.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {vehicles.map((vehicle) => {
                const isSelected = selectedVehicle?.id === vehicle.id
                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    disabled={creating}
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    className={`rounded-2xl border p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-50 ${
                      isSelected
                        ? 'border-blue-500/40 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30'
                    }`}
                  >
                    <span className="block font-mono text-[15px] font-semibold text-neutral-950">
                      {vehicle.plateNumber}
                    </span>
                    <span className="mt-1 block text-[12px] text-neutral-500">
                      {vehicle.vehicleType === 'car' ? 'Car' : 'Motorbike'}
                    </span>
                    <span className="mt-2 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                      {vehicle.linkedRole}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !selectedVehicle}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 px-5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:pointer-events-none disabled:opacity-60"
          >
            {creating ? 'Finding slot...' : 'Reserve linked vehicle'}
          </button>
        </div>

        {loading && <p className="text-gray-500">Loading...</p>}

        {activeReservations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Active reservation</h2>
            {activeReservations.map((r) => (
              <ReservationCard key={r.id} reservation={r} onCancel={handleCancel} />
            ))}
          </div>
        )}

        {pastReservations.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-600">Reservation history</h2>
            {pastReservations.map((r) => (
              <ReservationCard key={r.id} reservation={r} />
            ))}
          </div>
        )}

        {!loading && reservations.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            No reservation history yet.
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
  const slot = reservation.slot

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold">
              {reservation.licensePlate ?? reservation.vehicle?.plateNumber ?? 'UNKNOWN'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${status.color}`}>
              {status.text}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {reservation.vehicleType === 'car' ? 'Car' : 'Motorbike'}
            {slot?.code ? ` • Slot ${slot.code}` : ''}
            {slot?.floor ? ` • ${slot.floor.name}` : ''}
          </p>
          <p className="text-xs text-gray-500">
            Reserved at: {formatDateTime(reservation.createdAt)}
          </p>
          {isActive && <Countdown expiresAt={reservation.expiresAt} />}
        </div>

        {isActive && onCancel && (
          <button
            onClick={() => onCancel(reservation.id)}
            className="text-sm font-medium text-red-600 hover:text-red-800"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => calcRemaining(expiresAt))

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(calcRemaining(expiresAt))
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  if (remaining <= 0) {
    return <p className="text-xs font-bold text-red-600">Expired</p>
  }

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const isUrgent = minutes < 5

  return (
    <div className={`flex items-center gap-2 ${isUrgent ? 'text-red-600' : 'text-gray-700'}`}>
      <span className="text-xs">Remaining:</span>
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
