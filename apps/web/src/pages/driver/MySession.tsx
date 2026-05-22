import { useEffect, useState } from 'react'
import {
  getMyActiveSessions,
  getSessionQr,
  type ActiveSession,
} from '../../lib/driver-api'

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

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
      setError('Không thể tải thông tin phiên gửi xe')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-md mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Phiên gửi xe</h1>
          <p className="text-sm text-gray-500">
            Xuất trình mã QR cho nhân viên khi ra cổng
          </p>
        </header>

        {loading && <p className="text-gray-500">Đang tải...</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {!loading && sessions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg mb-2">Không có phiên gửi xe nào</p>
            <p className="text-gray-400 text-sm">
              Bạn chưa check-in hoặc phiên đã kết thúc.
            </p>
          </div>
        )}

        {sessions.map((session) => (
          <div key={session.id} className="card text-center space-y-4">
            <div>
              <p className="text-sm text-gray-500">Biển số</p>
              <p className="text-2xl font-bold font-mono">{session.licensePlate}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-gray-500">Vị trí</p>
                <p className="font-bold">{session.slot.code}</p>
              </div>
              <div>
                <p className="text-gray-500">Tầng</p>
                <p className="font-bold">{session.slot.floor.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Loại xe</p>
                <p>{session.vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}</p>
              </div>
              <div>
                <p className="text-gray-500">Giờ vào</p>
                <p>{formatDateTime(session.checkInTime)}</p>
              </div>
            </div>

            {qrCodes[session.id] ? (
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm font-medium mb-2">Mã QR check-out</p>
                <img
                  src={qrCodes[session.id]}
                  alt="QR Code"
                  className="w-56 h-56 mx-auto border border-gray-200 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Đưa mã này cho nhân viên khi ra cổng.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 border-t border-gray-200 pt-4">
                Không có mã QR cho phiên này.
              </p>
            )}
          </div>
        ))}

        {sessions.length > 0 && (
          <button onClick={loadSessions} className="btn-secondary text-sm w-full">
            Làm mới
          </button>
        )}
      </div>
    </div>
  )
}
