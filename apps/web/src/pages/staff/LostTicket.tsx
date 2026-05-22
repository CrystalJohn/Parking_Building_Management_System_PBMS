import { useState } from 'react'
import { isAxiosError } from 'axios'
import api from '../../lib/api'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'

const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

interface LostTicketResult {
  session: {
    id: string
    licensePlate: string
    vehicleType: string
    checkInTime: string
    isLostTicket: boolean
  }
  slot: {
    code: string
    floor: string
  }
  breakdown: {
    roundedHours: number
    hourlyRate: number
    baseFee: number
    isOvertime: boolean
    overtimePenalty: number
    isLostTicket: boolean
    lostTicketPenalty: number
    totalFee: number
  }
}

/**
 * 24.4: Staff Lost Ticket page.
 * Form to verify driver identity and process lost ticket with penalty.
 * Req 5.6, 7.3, 7.4
 */
export default function LostTicket() {
  const toasts = useToasts()
  const [licensePlate, setLicensePlate] = useState('')
  const [idCardNo, setIdCardNo] = useState('')
  const [driverLicenseNo, setDriverLicenseNo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<LostTicketResult | null>(null)

  const reset = () => {
    setLicensePlate('')
    setIdCardNo('')
    setDriverLicenseNo('')
    setResult(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!licensePlate.trim() || !idCardNo.trim() || !driverLicenseNo.trim()) {
      toasts.showError('Vui lòng điền đầy đủ thông tin')
      return
    }

    setSubmitting(true)
    try {
      const { data } = await api.post('/tickets/lost', {
        licensePlate: licensePlate.trim().toUpperCase(),
        idCardNo: idCardNo.trim(),
        driverLicenseNo: driverLicenseNo.trim(),
      })
      setResult(data)
      toasts.showSuccess('Đã xử lý mất vé — phí đã cập nhật')
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status
        const msg = err.response?.data?.message
        const text = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(', ') : undefined

        if (status === 404) {
          toasts.showError(text ?? 'Không tìm thấy phiên gửi xe cho biển số này')
        } else {
          toasts.showError(text ?? `Lỗi (${status ?? 'network'})`)
        }
      } else {
        toasts.showError('Lỗi không xác định')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold">Xử lý mất vé</h1>
          <p className="text-sm text-gray-500">
            Xác minh danh tính tài xế trước khi xử lý. Phụ thu 100.000 VND.
          </p>
        </header>

        {result ? (
          <ResultView result={result} onReset={reset} />
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Biển số xe <span className="text-red-500">*</span>
              </label>
              <input
                className="input uppercase"
                placeholder="VD: 59A-12345"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số CMND/CCCD <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                placeholder="VD: 079123456789"
                value={idCardNo}
                onChange={(e) => setIdCardNo(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Số GPLX <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                placeholder="VD: B2-123456"
                value={driverLicenseNo}
                onChange={(e) => setDriverLicenseNo(e.target.value)}
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
              <p className="font-medium">Lưu ý:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Xác minh CMND/CCCD và GPLX khớp với người yêu cầu</li>
                <li>Phụ thu mất vé: 100.000 VND sẽ được cộng vào phí</li>
                <li>Nếu không xác minh được, liên hệ Quản lý để xử lý</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Đang xử lý...' : 'Xác nhận mất vé'}
              </button>
            </div>
          </form>
        )}

        <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      </div>
    </div>
  )
}

function ResultView({
  result,
  onReset,
}: {
  result: LostTicketResult
  onReset: () => void
}) {
  const { session, slot, breakdown } = result

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-semibold text-green-700">
        Đã xử lý mất vé
      </h2>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500">Biển số</dt>
        <dd className="font-medium">{session.licensePlate}</dd>

        <dt className="text-gray-500">Loại xe</dt>
        <dd>{session.vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}</dd>

        <dt className="text-gray-500">Vị trí</dt>
        <dd>{slot.code} — {slot.floor}</dd>

        <dt className="text-gray-500">Giờ vào</dt>
        <dd>{formatDateTime(session.checkInTime)}</dd>
      </dl>

      <div className="border-t border-gray-200 pt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">
            Phí cơ bản ({breakdown.roundedHours}h x {VND(breakdown.hourlyRate)})
          </span>
          <span>{VND(breakdown.baseFee)}</span>
        </div>
        {breakdown.isOvertime && (
          <div className="flex justify-between text-yellow-700">
            <span>Phụ thu quá giờ (&gt;24h)</span>
            <span>{VND(breakdown.overtimePenalty)}</span>
          </div>
        )}
        <div className="flex justify-between text-red-700">
          <span>Phụ thu mất vé</span>
          <span>{VND(breakdown.lostTicketPenalty)}</span>
        </div>
        <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
          <span>Tổng cộng</span>
          <span>{VND(breakdown.totalFee)}</span>
        </div>
      </div>

      <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2">
        Tiếp tục check-out bình thường tại tab Check-out (trang Cổng ra/vào).
        Phí mất vé đã được ghi nhận vào phiên.
      </p>

      <button onClick={onReset} className="btn-secondary">
        Xử lý trường hợp khác
      </button>
    </div>
  )
}
