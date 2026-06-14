import { useCallback, useState } from 'react'
import { isAxiosError } from 'axios'
import { NavLink, useNavigate } from 'react-router-dom'
import { ToastContainer } from '../../components/ui/Toast'
import { clearAuth, getUser } from '../../lib/auth'
import { useToasts } from '../../lib/use-toasts'
import {
  checkIn,
  checkOut,
  confirmPayment,
  confirmCashPayment,
  confirmVehicleExited,
  lookupSessionForCheckout,
  requestCheckout,
  type CheckInResponse,
  type CheckInIdentificationMethod,
  type CheckOutResponse,
  type CheckoutWorkflowResponse,
  type ConfirmExitResponse,
  type ConfirmPaymentResponse,
  type PaymentStatus,
  type SessionStatus,
  type VehicleType,
} from '../../lib/sessions-api'
import { Receipt } from '../../components/receipt/Receipt'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import { LicensePlateScanner } from '../../components/plate-scanner/LicensePlateScanner'
import { formatDateTimeVN } from '../../lib/date-time'
import { StaffOcrCheckInPanel } from './StaffOcrCheckInPanel'

type Tab = 'check-in' | 'check-out'

const GATE_TABS: Array<{
  id: Tab
  title: string
  subtitle: string
  activeHint: string
}> = [
  {
    id: 'check-in',
    title: 'Check-in',
    subtitle: 'Xe vào bãi',
    activeHint: 'OCR, đặt chỗ, cấp vé',
  },
  {
    id: 'check-out',
    title: 'Check-out',
    subtitle: 'Xe ra khỏi bãi',
    activeHint: 'QR, biển số, thu phí',
  },
]

const STAFF_NAV = [
  { to: '/staff/gate', label: 'Cổng ra/vào' },
  { to: '/staff/lost-ticket', label: 'Mất vé' },
]

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
  const navigate = useNavigate()
  const user = getUser()
  const activeTab = GATE_TABS.find((item) => item.id === tab) ?? GATE_TABS[0]
  const userInitial = (user?.fullName || user?.phone || 'S')[0].toUpperCase()

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-50 border-b border-slate-200/80 bg-slate-100/95 shadow-sm backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-600 to-slate-950 text-sm font-black text-white shadow-lg shadow-primary-600/20">
                {userInitial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {user?.fullName || user?.phone || 'Gate Staff'}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Nhân viên cổng
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-1 lg:border-l lg:border-slate-300 lg:pl-3" aria-label="Staff navigation">
              {STAFF_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                      isActive
                        ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <header className="min-w-0 lg:border-l lg:border-slate-300 lg:pl-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Gate Workspace
              </p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-xl font-black tracking-tight text-slate-950">
                  Cổng ra/vào
                </h1>
                <span className="text-sm font-medium text-slate-500">
                  Đang dùng: {activeTab.title}
                </span>
              </div>
            </header>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <nav
              className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:min-w-[360px]"
              role="tablist"
              aria-label="Gate actions"
            >
              {GATE_TABS.map((item) => {
                const isActive = tab === item.id
                return (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`gate-panel-${item.id}`}
                    onClick={() => setTab(item.id)}
                    className={`group rounded-xl px-3 py-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                      isActive
                        ? 'bg-slate-950 text-white shadow-md'
                        : 'bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black">{item.title}</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isActive ? 'bg-emerald-400' : 'bg-slate-300 group-hover:bg-slate-400'
                        }`}
                      />
                    </span>
                    <span
                      className={`mt-0.5 block text-[11px] font-medium ${
                        isActive ? 'text-slate-300' : 'text-slate-500'
                      }`}
                    >
                      {item.subtitle} · {item.activeHint}
                    </span>
                  </button>
                )
              })}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-950 hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 print:max-w-none print:p-0">
        <div
          id={`gate-panel-${tab}`}
          role="tabpanel"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-5"
        >
          {tab === 'check-in' ? (
            <StaffOcrCheckInPanel toasts={toasts} />
          ) : (
            <CheckOutPanel toasts={toasts} />
          )}
        </div>
      </main>

      <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  )
}

// ─── Check-in Panel ──────────────────────────────────────────────────────────

interface PanelProps {
  toasts: ReturnType<typeof useToasts>
}

export function CheckInPanel({ toasts }: PanelProps) {
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

export function LegacyCheckOutPanel({ toasts }: PanelProps) {
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

function CheckOutPanel({ toasts }: PanelProps) {
  const [sessionCode, setSessionCode] = useState('')
  const [licensePlate, setLicensePlate] = useState('')
  const [workflow, setWorkflow] = useState<CheckoutWorkflowResponse | null>(null)
  const [receipt, setReceipt] = useState<ConfirmPaymentResponse | null>(null)
  const [exitResult, setExitResult] = useState<ConfirmExitResponse | null>(null)
  const [action, setAction] = useState<'lookup' | 'checkout' | 'payment' | 'exit' | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  const status = workflow?.session.status
  const paymentStatus = workflow?.payment?.status ?? null
  const canRequestCheckout = status === 'active'
  const canConfirmPayment = status === 'checkout_pending'
  const canConfirmExit = status === 'exit_authorized'
  const isCompleted = status === 'completed'

  const reset = () => {
    setSessionCode('')
    setLicensePlate('')
    setWorkflow(null)
    setReceipt(null)
    setExitResult(null)
    setAction(null)
    setShowScanner(false)
  }

  const normalizeSessionCode = (value: string) => {
    const trimmed = value.trim()
    return trimmed.toUpperCase().startsWith('PBMS-') ? trimmed.toUpperCase() : trimmed
  }

  const lookupSession = async (input: { sessionCode?: string; licensePlate?: string }) => {
    const code = input.sessionCode ? normalizeSessionCode(input.sessionCode) : ''
    const plate = input.licensePlate?.trim().toUpperCase() ?? ''
    if (!code && !plate) {
      toasts.showError('Nhap Session Code/QR hoac bien so de tra cuu.')
      return
    }

    setAction('lookup')
    try {
      const data = await lookupSessionForCheckout({
        sessionCode: code || undefined,
        licensePlate: plate || undefined,
      })
      setWorkflow(data)
      setReceipt(null)
      setExitResult(null)
      if (data.session.status === 'completed') {
        toasts.showInfo('Session nay da hoan tat checkout.')
      } else {
        toasts.showSuccess('Da tai session checkout.')
      }
    } catch (err) {
      const { message } = extractError(err)
      toasts.showError(message || 'Khong tim thay session.')
    } finally {
      setAction(null)
    }
  }

  const handleLookupBySession = (event: React.FormEvent) => {
    event.preventDefault()
    lookupSession({ sessionCode })
  }

  const handleLookupByPlate = (event: React.FormEvent) => {
    event.preventDefault()
    lookupSession({ licensePlate })
  }

  const handleQRScanned = useCallback((decodedText: string) => {
    const code = decodedText.trim()
    setShowScanner(false)
    if (!code) {
      toasts.showError('Ma QR khong hop le.')
      return
    }
    setSessionCode(code)
    lookupSession({ sessionCode: code })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toasts])

  const handleRequestCheckout = async () => {
    if (!workflow) return
    setAction('checkout')
    try {
      const data = await requestCheckout({
        sessionCode: workflow.session.sessionCode || workflow.session.id,
      })
      setWorkflow(data)
      setReceipt(null)
      setExitResult(null)
      toasts.showSuccess('Checkout started. Payment is pending.')
    } catch (err) {
      const { message } = extractError(err)
      toasts.showError(message || 'Checkout failed.')
    } finally {
      setAction(null)
    }
  }

  const handleConfirmPayment = async () => {
    if (!workflow) return
    setAction('payment')
    try {
      const response = await confirmCashPayment(workflow.session.id)
      setReceipt(response)
      setWorkflow((current) =>
        current
          ? {
              ...current,
              session: {
                ...current.session,
                status: response.exitAuthorizationStatus,
                isPaid: true,
                feeAmount: response.fee.baseFee,
                penaltyAmount: response.fee.penalty,
                isOvertime: response.fee.isOvertime,
                isLostTicket: response.fee.isLostTicket,
              },
              fee: response.fee,
              payment: {
                id: response.paymentId,
                sessionId: response.sessionId,
                amount: response.fee.total,
                method: response.paymentMethod,
                status: response.paymentStatus,
                paidAt: response.paidAt,
              },
            }
          : current,
      )
      toasts.showSuccess('Cash payment confirmed. Vehicle is authorized to exit.')
    } catch (err) {
      const { message } = extractError(err)
      toasts.showError(message || 'Payment confirmation failed.')
    } finally {
      setAction(null)
    }
  }

  const handleConfirmExit = async () => {
    if (!workflow) return
    setAction('exit')
    try {
      const response = await confirmVehicleExited(workflow.session.id)
      setExitResult(response)
      setWorkflow((current) =>
        current
          ? {
              ...current,
              session: {
                ...current.session,
                status: response.session.status,
                checkOutTime: response.session.checkOutTime,
              },
              slot: {
                ...current.slot,
                status: response.slot.status,
              },
            }
          : current,
      )
      toasts.showSuccess('Vehicle exit confirmed. Slot released.')
    } catch (err) {
      const { message } = extractError(err)
      toasts.showError(message || 'Exit confirmation failed.')
    } finally {
      setAction(null)
    }
  }

  const handlePrint = () => window.print()

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Cash Checkout Flow
          </p>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            Staff Check-out
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Khach dua Session Ticket/QR khi ra bai. Nhap Session Code hoac quet QR de bat dau checkout.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-950 hover:text-white"
        >
          Next Vehicle
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_420px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <form onSubmit={handleLookupBySession} className="space-y-2">
                <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Session Code / QR
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="input font-mono text-base font-black uppercase tracking-[0.08em]"
                    placeholder="PBMS-D1878BC500"
                    value={sessionCode}
                    onChange={(event) => setSessionCode(event.target.value)}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="btn-primary whitespace-nowrap"
                    disabled={action === 'lookup'}
                  >
                    {action === 'lookup' ? 'Loading...' : 'Lookup Session'}
                  </button>
                </div>
              </form>

              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-slate-950 hover:text-slate-950 disabled:opacity-60"
                disabled={action === 'lookup'}
              >
                Scan QR
              </button>
            </div>

            <form onSubmit={handleLookupByPlate} className="mt-4 border-t border-slate-200 pt-4">
              <label className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Tim bang bien so neu khach mat ve
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="input uppercase"
                  placeholder="VD: 59A-12345"
                  value={licensePlate}
                  onChange={(event) => setLicensePlate(event.target.value)}
                />
                <button
                  type="submit"
                  className="btn-secondary whitespace-nowrap"
                  disabled={action === 'lookup'}
                >
                  Search Plate
                </button>
              </div>
            </form>
          </section>

          {workflow ? (
            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                      Session Detail
                    </p>
                    <p className="mt-1 font-mono text-2xl font-black tracking-[0.08em] text-slate-950">
                      {workflow.session.sessionCode}
                    </p>
                  </div>
                  <StatusBadge status={workflow.session.status} />
                </div>

                <div className="mt-5 grid gap-3 text-sm">
                  <DetailRow label="Plate" value={workflow.session.licensePlate} strong />
                  <DetailRow label="Vehicle" value={formatVehicleType(workflow.session.vehicleType)} />
                  <DetailRow label="Slot" value={workflow.slot.code} mono strong />
                  <DetailRow label="Floor / Zone" value={`${workflow.slot.floor.name} / Zone ${workflow.slot.zone}`} />
                  <DetailRow label="Check-in" value={formatDateTime(workflow.session.checkInTime)} />
                  <DetailRow label="Duration" value={`${workflow.fee.durationHours} hour${workflow.fee.durationHours > 1 ? 's' : ''}`} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                      Fee / Payment
                    </p>
                    <p className="mt-1 text-3xl font-black text-slate-950">
                      {VND(workflow.fee.total)}
                    </p>
                  </div>
                  <PaymentBadge status={paymentStatus} />
                </div>

                <div className="mt-5 space-y-2 text-sm">
                  <DetailRow label="Base fee" value={VND(workflow.fee.baseFee)} />
                  <DetailRow label="Penalty" value={VND(workflow.fee.penalty)} />
                  <DetailRow label="Method" value="Cash" />
                  <DetailRow
                    label="Payment"
                    value={workflow.payment ? readablePaymentStatus(workflow.payment.status) : 'Not created'}
                  />
                  {workflow.payment?.paidAt ? (
                    <DetailRow label="Paid at" value={formatDateTime(workflow.payment.paidAt)} />
                  ) : null}
                </div>

                {workflow.fee.isOvertime || workflow.fee.isLostTicket ? (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    Fee includes penalty.
                  </p>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                Waiting for Session Ticket
              </p>
              <p className="mt-2 text-lg font-bold text-slate-700">
                Enter Session Code or scan QR to load checkout details.
              </p>
            </section>
          )}

          {isCompleted && receipt ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xl font-black text-emerald-950">Checkout completed</p>
                  <p className="text-sm font-semibold text-emerald-700">
                    Vehicle exited. Slot released.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handlePrint} className="btn-secondary print:hidden">
                    Print Receipt
                  </button>
                  <button type="button" onClick={reset} className="btn-primary print:hidden">
                    Next Vehicle
                  </button>
                </div>
              </div>
              <div className="mt-4 print:block">
                <Receipt data={receipt} />
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
              Lifecycle Status
            </p>
            <div className="mt-5 space-y-4">
              <LifecycleStep label="Active" active={status === 'active'} complete={Boolean(status && status !== 'active')} />
              <LifecycleStep label="Checkout Pending" active={status === 'checkout_pending'} complete={status === 'exit_authorized' || status === 'completed'} />
              <LifecycleStep label="Payment Paid" active={paymentStatus === 'paid' && status === 'exit_authorized'} complete={status === 'completed'} />
              <LifecycleStep label="Exit Authorized" active={status === 'exit_authorized'} complete={status === 'completed'} />
              <LifecycleStep label="Completed / Slot Released" active={status === 'completed'} complete={status === 'completed'} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Actions
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {workflow ? actionHint(workflow.session.status) : 'Load a session before starting checkout.'}
            </p>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleRequestCheckout}
                disabled={!canRequestCheckout || Boolean(action)}
                className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {action === 'checkout' ? 'Starting checkout...' : 'Calculate Fee & Start Checkout'}
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={!canConfirmPayment || Boolean(action)}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {action === 'payment' ? 'Confirming cash...' : 'Confirm Cash Payment'}
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                disabled={!canConfirmExit || Boolean(action)}
                className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-black text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {action === 'exit' ? 'Releasing slot...' : 'Confirm Vehicle Exited'}
              </button>
            </div>

            {!canConfirmExit && workflow?.session.status === 'checkout_pending' ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Chi xac nhan xe ra sau khi da thanh toan.
              </p>
            ) : null}

            {workflow?.session.status === 'exit_authorized' ? (
              <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                Da thanh toan. Xe duoc phep ra. Slot van occupied den khi nhan vien xac nhan xe da ra.
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Exit Summary
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <DetailRow label="Slot status" value={workflow?.slot.status ?? 'Not loaded'} />
              <DetailRow label="Exit authorization" value={readableExitStatus(status)} />
              <DetailRow
                label="Final checkout"
                value={
                  workflow?.session.checkOutTime
                    ? formatDateTime(workflow.session.checkOutTime)
                    : exitResult?.session.checkOutTime
                      ? formatDateTime(exitResult.session.checkOutTime)
                      : 'Pending'
                }
              />
            </div>
          </section>
        </aside>
      </div>

      {showScanner ? (
        <QRScanner
          title="Scan Session QR"
          instructions="Scan Session QR/code from the parking ticket issued at check-in."
          manualToggleLabel="Camera cannot scan? Enter Session Code manually"
          manualInputLabel="Session Code / QR"
          manualInputPlaceholder="PBMS-D1878BC500"
          onScan={handleQRScanned}
          onClose={() => setShowScanner(false)}
          onManualInput={handleQRScanned}
        />
      ) : null}
    </div>
  )
}

function formatVehicleType(type: VehicleType) {
  return type === 'car' ? 'Car' : 'Motorbike'
}

function readableStatus(status: SessionStatus) {
  const labels: Record<SessionStatus, string> = {
    active: 'Active',
    checkout_pending: 'Checkout Pending',
    exit_authorized: 'Exit Authorized',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return labels[status]
}

function readablePaymentStatus(status: PaymentStatus) {
  const labels: Record<PaymentStatus, string> = {
    pending: 'Pending',
    paid: 'Paid',
    failed: 'Failed',
    cancelled: 'Cancelled',
    expired: 'Expired',
  }
  return labels[status]
}

function readableExitStatus(status?: SessionStatus) {
  if (status === 'exit_authorized') return 'Authorized'
  if (status === 'completed') return 'Exited'
  if (status === 'checkout_pending') return 'Waiting for payment'
  if (status === 'active') return 'Not ready'
  return 'Not loaded'
}

function actionHint(status: SessionStatus) {
  if (status === 'active') return 'Review session and start checkout to create a pending payment.'
  if (status === 'checkout_pending') return 'Collect cash, then confirm payment.'
  if (status === 'exit_authorized') return 'Payment is paid. Confirm vehicle exited to release the slot.'
  if (status === 'completed') return 'Checkout completed. Use Next Vehicle for the next operation.'
  return 'This session cannot continue checkout.'
}

function DetailRow({
  label,
  value,
  mono = false,
  strong = false,
}: {
  label: string
  value: string
  mono?: boolean
  strong?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span
        className={`text-right ${mono ? 'font-mono' : ''} ${
          strong ? 'font-black text-slate-950' : 'font-bold text-slate-700'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const tone: Record<SessionStatus, string> = {
    active: 'bg-blue-50 text-blue-700 ring-blue-200',
    checkout_pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    exit_authorized: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    completed: 'bg-slate-100 text-slate-700 ring-slate-200',
    cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  }
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ring-1 ${tone[status]}`}>
      {readableStatus(status)}
    </span>
  )
}

function PaymentBadge({ status }: { status: PaymentStatus | null }) {
  if (!status) {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500 ring-1 ring-slate-200">
        No Payment
      </span>
    )
  }

  const tone: Record<PaymentStatus, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    failed: 'bg-rose-50 text-rose-700 ring-rose-200',
    cancelled: 'bg-slate-100 text-slate-700 ring-slate-200',
    expired: 'bg-orange-50 text-orange-700 ring-orange-200',
  }
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ring-1 ${tone[status]}`}>
      {readablePaymentStatus(status)}
    </span>
  )
}

function LifecycleStep({
  label,
  active,
  complete,
}: {
  label: string
  active: boolean
  complete: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-black ${
          complete
            ? 'border-emerald-400 bg-emerald-400 text-slate-950'
            : active
              ? 'border-white bg-white text-slate-950'
              : 'border-slate-700 bg-slate-900 text-slate-500'
        }`}
      >
        {complete ? 'OK' : active ? 'ON' : ''}
      </span>
      <span className={active || complete ? 'font-black text-white' : 'font-semibold text-slate-500'}>
        {label}
      </span>
    </div>
  )
}
