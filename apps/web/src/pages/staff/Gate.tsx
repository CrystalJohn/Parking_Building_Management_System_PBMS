import { useCallback, useState } from 'react'
import { isAxiosError } from 'axios'
import { ToastContainer } from '../../components/ui/Toast'
import { useToasts } from '../../lib/use-toasts'
import {
  checkIn,
  checkOut,
  confirmPayment,
  type CheckInResponse,
  type CheckInIdentificationMethod,
  type CheckOutResponse,
  type ConfirmPaymentResponse,
  type VehicleType,
} from '../../lib/sessions-api'
import { Receipt } from '../../components/receipt/Receipt'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import { LicensePlateScanner } from '../../components/plate-scanner/LicensePlateScanner'
import { formatDateTimeVN } from '../../lib/date-time'

type Tab = 'check-in' | 'check-out'

const VND = (n: number) => `${n.toLocaleString('vi-VN')} VND`

const isUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function debugLog(...args: unknown[]) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Gate/Checkout]', ...args)
  }
}

const formatDateTime = formatDateTimeVN

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
  const [reservationId, setReservationId] = useState('')
  const [plateIdentificationMethod, setPlateIdentificationMethod] =
    useState<CheckInIdentificationMethod>('MANUAL_PLATE')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CheckInResponse | null>(null)
  const [showPlateScanner, setShowPlateScanner] = useState(false)
  const [showReservationScanner, setShowReservationScanner] = useState(false)
  const [showManualInput, setShowManualInput] = useState(false)

  const reset = () => {
    setLicensePlate('')
    setDriverPhone('')
    setReservationId('')
    setPlateIdentificationMethod('MANUAL_PLATE')
    setResult(null)
    setShowManualInput(false)
    setShowReservationScanner(false)
  }

  const handlePlateDetected = useCallback((plate: string) => {
    setLicensePlate(plate)
    setPlateIdentificationMethod('OCR')
    setShowPlateScanner(false)
    setShowManualInput(true)
    toasts.showSuccess(`Quét được biển số: ${plate}`)
  }, [toasts])

  const handleReservationQrScanned = useCallback((decodedText: string) => {
    const code = decodedText.trim()
    setShowReservationScanner(false)
    if (!code) {
      toasts.showError('Mã reservation QR không hợp lệ')
      return
    }

    setReservationId(code)
    toasts.showSuccess('Đã nhận reservation ID từ QR')
  }, [toasts])

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
        reservationId: reservationId.trim() || undefined,
        identificationMethod: reservationId.trim()
          ? 'RESERVATION_QR'
          : plateIdentificationMethod,
      })
      setResult(response)
      toasts.showSuccess(`Đã gán slot ${response.slot.code}`)
    } catch (err) {
      const { message, isFull } = extractError(err)
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
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <h2 className="text-lg font-semibold">Check-in xe vào bãi</h2>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-gray-800">
              Reservation ID / Code
            </label>
            <p className="text-xs text-gray-600 mt-1">
              Optional - used when the driver has reserved a slot. OCR / manual plate is still required to confirm the vehicle plate.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setShowReservationScanner(true)}
              className="btn-secondary"
              disabled={submitting}
            >
              Scan Reservation QR
            </button>
            {reservationId && (
              <button
                type="button"
                onClick={() => setReservationId('')}
                className="text-sm text-gray-500 hover:text-gray-700 px-2"
                disabled={submitting}
              >
                Clear
              </button>
            )}
          </div>

          <input
            className="input font-mono text-xs"
            placeholder="Paste or type reservation UUID"
            value={reservationId}
            onChange={(e) => setReservationId(e.target.value)}
            disabled={submitting}
          />

          <p className="text-xs text-gray-500">
            If provided, backend will use the reserved slot. If empty, check-in uses OCR/manual plate with smart allocation.
          </p>
        </div>

        {/* ── License plate section ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Biển số xe <span className="text-red-500">*</span>
          </label>

          {/* Primary: camera scan button */}
          {!showManualInput && !licensePlate && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowPlateScanner(true)}
                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl transition-all shadow-md hover:shadow-lg text-base"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                📸 Quét biển số xe bằng camera
              </button>
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 underline underline-offset-2 transition-colors"
              >
                ✏️ Nhập tay biển số (fallback)
              </button>
            </div>
          )}

          {/* After scan: show detected plate + allow re-scan or manual edit */}
          {(showManualInput || licensePlate) && (
            <div className="space-y-2">
              {licensePlate && !showManualInput && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <span className="text-green-600 text-lg">✓</span>
                  <span className="font-mono font-bold text-gray-900 text-lg tracking-widest flex-1">{licensePlate}</span>
                  <button
                    type="button"
                    onClick={() => setShowManualInput(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Sửa
                  </button>
                </div>
              )}

              {showManualInput && (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      className="input uppercase pr-10"
                      placeholder="VD: 59A-12345"
                      value={licensePlate}
                      onChange={(e) => {
                        setLicensePlate(e.target.value)
                        setPlateIdentificationMethod('MANUAL_PLATE')
                      }}
                      required
                      autoFocus
                    />
                    {licensePlate && (
                      <button
                        type="button"
                        onClick={() => setLicensePlate('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPlateScanner(true)}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 py-1 px-2 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Quét lại bằng camera
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Vehicle type ── */}
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

        {/* ── Driver phone ── */}
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

        {/* ── Submit ── */}
        {(licensePlate || showManualInput) && (
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={submitting || !licensePlate.trim()}>
              {submitting ? 'Đang xử lý...' : 'Check-in'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="btn-secondary"
              disabled={submitting}
            >
              Hủy
            </button>
          </div>
        )}
      </form>

      {/* License plate scanner modal */}
      {showPlateScanner && (
        <LicensePlateScanner
          onDetected={handlePlateDetected}
          onClose={() => setShowPlateScanner(false)}
        />
      )}

      {showReservationScanner && (
        <QRScanner
          title="Scan Reservation QR"
          instructions="Scan the reservation QR/code from the driver's mobile reservation detail screen."
          manualToggleLabel="Camera cannot scan? Enter reservation ID/code manually"
          manualInputLabel="Reservation ID / Code"
          manualInputPlaceholder="Reservation UUID"
          onScan={handleReservationQrScanned}
          onClose={() => setShowReservationScanner(false)}
          onManualInput={handleReservationQrScanned}
        />
      )}
    </>
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
    debugLog('lookup:start', req)
    try {
      const data = await checkOut(req)
      debugLog('lookup:success', {
        request: req,
        sessionId: data.sessionId,
        licensePlate: data.licensePlate,
      })
      setFeePreview(data)
    } catch (err) {
      debugLog('lookup:error', {
        request: req,
        isAxios: isAxiosError(err),
        status: isAxiosError(err) ? err.response?.status : undefined,
        message: isAxiosError(err) ? err.response?.data : String(err),
      })
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
      debugLog('qr:decoded', {
        raw: decodedText,
        normalized: sessionId,
        length: sessionId.length,
        isUuid: isUuid.test(sessionId),
      })
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
