import { useEffect, useState } from 'react'
import {
  getMyActiveSessions,
  getSessionQr,
  type ActiveSession,
} from '../../lib/driver-api'
import { formatDateTimeVN } from '../../lib/date-time'

const formatDateTime = formatDateTimeVN

/**
 * 23.4: Driver My Session — show QR code for active session.
 * Phase 1 fallback: driver shows QR on phone screen to staff at check-out.
 */
export default function MySession() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getMyActiveSessions()
      setSessions(data)

      // Load QR codes for each active session
      const qrs: Record<string, string> = {}
      for (const session of data) {
        if (session.qrCode) {
          qrs[session.id] = session.qrCode
        } else {
          try {
            const { qrCode } = await getSessionQr(session.id)
            qrs[session.id] = qrCode
          } catch {
            // QR generation failed — skip
          }
        }
      }
      setQrCodes(qrs)
    } catch {
      setError('Unable to load session information')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-md mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">My QR</h1>
          <p className="text-sm text-gray-500">
            Checkout QR for a session already parked. Reservation check-in QR is shown on Home.
          </p>
        </header>

        {loading && <p className="text-gray-500">Loading...</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {!loading && sessions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg mb-2">No active session</p>
            <p className="text-gray-400 text-sm">
              You have not checked in or your session has ended.
            </p>
          </div>
        )}

        {sessions.map((session) => (
          <div key={session.id} className="card text-center space-y-4">
            <div>
              <p className="text-sm text-gray-500">Plate</p>
              <p className="text-2xl font-bold font-mono">{session.licensePlate}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-gray-500">Slot</p>
                <p className="font-bold">{session.slot.code}</p>
              </div>
              <div>
                <p className="text-gray-500">Floor</p>
                <p className="font-bold">{session.slot.floor.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Vehicle</p>
                <p>{session.vehicleType === 'car' ? 'Car' : 'Motorbike'}</p>
              </div>
              <div>
                <p className="text-gray-500">Check-in time</p>
                <p>{formatDateTime(session.checkInTime)}</p>
              </div>
            </div>

            {qrCodes[session.id] ? (
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-medium mb-2">Check-out QR</p>
                <img
                  src={qrCodes[session.id]}
                  alt="QR Code"
                  className="w-56 h-56 mx-auto border border-gray-200 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Show this code to staff at the exit gate.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 border-t border-gray-200 pt-4">
                No QR code available for this session.
              </p>
            )}
          </div>
        ))}

        {sessions.length > 0 && (
          <button onClick={loadSessions} className="btn-secondary text-sm w-full">
            Refresh
          </button>
        )}
      </div>
    </div>
  )
}
