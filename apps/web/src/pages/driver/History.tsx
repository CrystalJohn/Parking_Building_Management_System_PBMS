import { useEffect, useState } from 'react'
import {
  getMyHistory,
  type ParkingSessionHistory,
} from '../../lib/driver-api'
import { formatDateTimeVN } from '../../lib/date-time'

const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`

const formatDateTime = formatDateTimeVN

/**
 * 23.3: Driver History — list past sessions with fee info.
 * Driver use case UC5
 */
export default function History() {
  const [sessions, setSessions] = useState<ParkingSessionHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getMyHistory()
      setSessions(data)
    } catch {
      setError('Unable to load history')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Parking history</h1>
          <p className="text-sm text-gray-500">Completed parking sessions</p>
        </header>

        {loading && <p className="text-gray-500">Loading...</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {!loading && sessions.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">
            No parking history yet.
          </p>
        )}

        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SessionCard({ session }: { session: ParkingSessionHistory }) {
  const totalFee = session.feeAmount + session.penaltyAmount

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold">{session.licensePlate}</span>
            <span className="text-xs text-gray-500">
              {session.vehicleType === 'car' ? 'Car' : 'Motorbike'}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            Slot: {session.slot.code} — {session.slot.floor.name}
          </p>
          <p className="text-xs text-gray-500">
            In: {formatDateTime(session.checkInTime)}
          </p>
          {session.checkOutTime && (
            <p className="text-xs text-gray-500">
              Out: {formatDateTime(session.checkOutTime)}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="font-bold text-lg">{VND(totalFee)}</p>
          {session.isOvertime && (
            <span className="text-xs text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded">
              Overtime
            </span>
          )}
          {session.isLostTicket && (
            <span className="text-xs text-red-700 bg-red-50 px-1.5 py-0.5 rounded ml-1">
              Lost ticket
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
