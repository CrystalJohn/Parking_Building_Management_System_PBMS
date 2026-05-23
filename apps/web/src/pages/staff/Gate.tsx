import { useCallback, useState } from 'react'
import { isAxiosError } from 'axios'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'
import {
  checkIn,
  checkOut,
  confirmPayment,
  type CheckInResponse,
  type CheckOutResponse,
  type ConfirmPaymentResponse,
  type VehicleType,
} from '../../lib/sessions-api'
import { Receipt } from '../../components/receipt/Receipt'
import { QRScanner } from '../../components/qr-scanner/QRScanner'

type Tab = 'check-in' | 'check-out'

const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * Extracts a user-friendly error message from an Axios error.
 * Special-cases 409 Conflict (building full / no slot).
 */
function extractError(err: unknown): { message: string; isFull: boolean } {
  if (isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as { message?: string | string[] } | undefined
    const raw = data?.message
    const text = Array.isArray(raw) ? raw.join(', ') : raw
    if (status === 409) {
      // Distinguish between "building full" and "duplicate plate" conflicts
      const isDuplicate = text && /đang có phiên|already|duplicate/i.test(text)
      return { message: text ?? 'Bãi đã đầy', isFull: !isDuplicate }
    }
    if (status === 404) {
      return { message: text ?? 'Không tìm thấy phiên gửi xe', isFull: false }
    }
    return { message: text ?? `Lỗi (${status ?? 'network'})`, isFull: false }
  }
  return { message: 'Lỗi không xác định', isFull: false }
}

export default function Gate() {
  const [tab, setTab] = useState<Tab>('check-in')
  const toasts = useToasts()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Cổng ra/vào</h1>
          <p className="text-sm text-gray-500">
            Nhân viên thao tác check-in / check-out tại đây.
          </p>
        </header>

        <nav className="flex gap-2 mb-4" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'check-in'}
            onClick={() => setTab('check-in')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
              tab === 'check-in'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Check-in
          </button>
          <button
            role="tab"
            aria-selected={tab === 'check-out'}
            onClick={() => setTab('check-out')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
              tab === 'check-out'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Check-out
          </button>
        </nav>

        <div className="card">
          {tab === 'check-in' ? (
            <CheckInPanel toasts={toasts} />
          ) : (
            <CheckOutPanel toasts={toasts} />
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  )
}

// ─── Check-in Panel ──────────────────────────────────────────────────────────

interface PanelProps {
  toasts: ReturnType<typeof useToasts>
}

function CheckInPanel({ toasts }: PanelProps) {
  const [licensePlate, setLicensePlate] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('car')
  const [driverPhone, setDriverPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CheckInResponse | null>(null)

  const reset = () => {
    setLicensePlate('')
    setDriverPhone('')
    setResult(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licensePlate.trim()) {
      toasts.showError('Vui lòng nhập biển số xe')
      return
    }

    setSubmitting(true)
    try {
      const response = await checkIn({
        licensePlate: licensePlate.trim().toUpperCase(),
        vehicleType,
        driverPhone: driverPhone.trim() || undefined,
      })
      setResult(response)
      toasts.showSuccess(`Đã gán slot ${response.slot.code}`)
    } catch (err) {
      const { message, isFull } = extractError(err)
      // 17.4: explicit "Building full" toast on Conflict
      if (isFull) {
        toasts.showError(`Bãi đã đầy: ${message}`)
      } else {
        toasts.showError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return <CheckInResult data={result} onNext={reset} />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold">Check-in xe vào bãi</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Biển số xe <span className="text-red-500">*</span>
        </label>
        <input
          className="input uppercase"
          placeholder="VD: 59A-12345"
          value={licensePlate}
          onChange={(e) => setLicensePlate(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Loại xe <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="vehicleType"
              value="car"
              checked={vehicleType === 'car'}
              onChange={() => setVehicleType('car')}
            />
            <span>Ô tô (Khu A)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="vehicleType"
              value="motorbike"
              checked={vehicleType === 'motorbike'}
              onChange={() => setVehicleType('motorbike')}
            />
            <span>Xe máy (Khu B)</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          SĐT tài xế <span className="text-gray-400 font-normal">(không bắt buộc)</span>
        </label>
        <input
          className="input"
          placeholder="VD: 0901234567 — nhập nếu khách có tài khoản để gửi QR"
          value={driverPhone}
          onChange={(e) => setDriverPhone(e.target.value)}
        />
        <p className="text-xs text-gray-500 mt-1">
          Nếu khách đã đăng ký, hệ thống sẽ tạo mã QR để check-out.
        </p>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Đang xử lý...' : 'Check-in'}
        </button>
      </div>
    </form>
  )
}

function CheckInResult({
  data,
  onNext,
}: {
  data: CheckInResponse
  onNext: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-green-700">
        ✓ Check-in thành công
      </h2>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500">Biển số</dt>
        <dd className="font-medium">{data.session.licensePlate}</dd>

        <dt className="text-gray-500">Loại xe</dt>
        <dd>{data.session.vehicleType === 'car' ? 'Ô tô' : 'Xe máy'}</dd>

        <dt className="text-gray-500">Vị trí gán</dt>
        <dd className="font-mono text-lg font-bold">{data.slot.code}</dd>

        <dt className="text-gray-500">Tầng</dt>
        <dd>
          {data.slot.floor.name} (Tầng {data.slot.floor.floorNumber}) — Khu {data.slot.zone}
        </dd>

        <dt className="text-gray-500">Giờ vào</dt>
        <dd>{formatDateTime(data.session.checkInTime)}</dd>
      </dl>

      {data.qr_code && (
        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-medium mb-2">
            Mã QR cho tài xế (đã đăng ký):
          </p>
          <img
            src={data.qr_code}
            alt="QR code"
            className="w-48 h-48 border border-gray-200 rounded-md"
          />
          <p className="text-xs text-gray-500 mt-2">
            Tài xế xuất trình QR này khi ra để check-out.
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onNext} className="btn-primary">
          Xe tiếp theo
        </button>
      </div>
    </div>
  )
}

// ─── Check-out Panel ─────────────────────────────────────────────────────────

function CheckOutPanel({ toasts }: PanelProps) {
  const [licensePlate, setLicensePlate] = useState('')
  const [feePreview, setFeePreview] = useState<CheckOutResponse | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<ConfirmPaymentResponse | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  const reset = () => {
    setLicensePlate('')
    setFeePreview(null)
    setReceipt(null)
  }

  const lookup = async (req: { sessionId?: string; licensePlate?: string }) => {
    setSubmitting(true)
    try {
      const data = await checkOut(req)
      setFeePreview(data)
    } catch (err) {
      const { message } = extractError(err)
      toasts.showError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLookupByPlate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!licensePlate.trim()) {
      toasts.showError('Vui lòng nhập biển số xe')
      return
    }
    lookup({ licensePlate: licensePlate.trim().toUpperCase() })
  }

  const handleScanQR = () => {
    setShowScanner(true)
  }

  const handleQRScanned = useCallback(
    (decodedText: string) => {
      setShowScanner(false)
      // The QR encodes the session UUID directly
      const sessionId = decodedText.trim()
      if (sessionId) {
        lookup({ sessionId })
      } else {
        toasts.showError('Mã QR không hợp lệ')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const handleScannerClose = useCallback(() => {
    setShowScanner(false)
  }, [])

  const handleConfirmPayment = async () => {
    if (!feePreview) return
    setConfirming(true)
    try {
      const response = await confirmPayment(feePreview.sessionId)
      setReceipt(response)
      toasts.showSuccess('Đã xác nhận thanh toán')
    } catch (err) {
      const { message } = extractError(err)
      toasts.showError(message)
    } finally {
      setConfirming(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (receipt) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-green-700">
          ✓ Thanh toán thành công
        </h2>
        <Receipt data={receipt} />
        <div className="flex gap-2 print:hidden">
          <button onClick={handlePrint} className="btn-primary">
            In biên lai
          </button>
          <button onClick={reset} className="btn-secondary">
            Xe tiếp theo
          </button>
        </div>
      </div>
    )
  }

  if (feePreview) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Xác nhận thanh toán</h2>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-gray-500">Biển số</dt>
          <dd className="font-medium">{feePreview.licensePlate}</dd>

          <dt className="text-gray-500">Vị trí</dt>
          <dd className="font-mono">{feePreview.slotCode}</dd>

          <dt className="text-gray-500">Vào</dt>
          <dd>{formatDateTime(feePreview.checkInTime)}</dd>

          <dt className="text-gray-500">Ra</dt>
          <dd>{formatDateTime(feePreview.checkOutTime)}</dd>

          <dt className="text-gray-500">Thời gian</dt>
          <dd>{feePreview.fee.durationHours} giờ</dd>
        </dl>

        <div className="border-t border-gray-200 pt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Phí cơ bản</span>
            <span>{VND(feePreview.fee.baseFee)}</span>
          </div>
          {feePreview.fee.penalty > 0 && (
            <div className="flex justify-between text-yellow-700">
              <span>
                Phụ thu
                {feePreview.fee.isOvertime && ' (quá giờ > 24h)'}
                {feePreview.fee.isLostTicket && ' (mất vé)'}
              </span>
              <span>{VND(feePreview.fee.penalty)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
            <span>Tổng cộng</span>
            <span>{VND(feePreview.fee.total)}</span>
          </div>
        </div>

        {feePreview.fee.isOvertime && (
          <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-2">
            ⚠ Phiên này quá 24 giờ — đã áp dụng phụ thu.
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleConfirmPayment}
            className="btn-primary"
            disabled={confirming}
          >
            {confirming ? 'Đang xác nhận...' : 'Xác nhận đã thu tiền mặt'}
          </button>
          <button onClick={reset} className="btn-secondary" disabled={confirming}>
            Hủy
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleLookupByPlate} className="space-y-4">
      <h2 className="text-lg font-semibold">Check-out xe ra khỏi bãi</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Biển số xe
        </label>
        <input
          className="input uppercase"
          placeholder="VD: 59A-12345"
          value={licensePlate}
          onChange={(e) => setLicensePlate(e.target.value)}
          autoFocus
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Đang tra cứu...' : 'Tra cứu theo biển số'}
        </button>
        <button
          type="button"
          onClick={handleScanQR}
          className="btn-secondary"
          disabled={submitting}
        >
          📷 Quét QR
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Khách có tài khoản: quét QR từ app. Khách vãng lai: nhập biển số.
      </p>

      {showScanner && (
        <QRScanner
          onScan={handleQRScanned}
          onClose={handleScannerClose}
          onManualInput={handleQRScanned}
        />
      )}
    </form>
  )
}
