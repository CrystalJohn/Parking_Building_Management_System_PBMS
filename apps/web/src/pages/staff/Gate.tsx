import { useCallback, useEffect, useRef, useState } from 'react'
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
  createBankQrPayment,
  getPaymentStatus,
  lookupSessionForCheckout,
  requestCheckout,
  type CheckInResponse,
  type CheckInIdentificationMethod,
  type CheckOutResponse,
  type CheckoutWorkflowResponse,
  type ConfirmExitResponse,
  type ConfirmPaymentResponse,
  type PaymentMethod,
  type PaymentWorkflowResponse,
  type PaymentStatus,
  type SessionStatus,
  type VehicleType,
} from '../../lib/sessions-api'
import { Receipt } from '../../components/receipt/Receipt'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import { RecentSessionsCard } from '../../components/ui/RecentSessionsCard'
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
    subtitle: 'Vehicle entry',
    activeHint: 'OCR, reserve, issue ticket',
  },
  {
    id: 'check-out',
    title: 'Check-out',
    subtitle: 'Vehicle exit',
    activeHint: 'QR, plate, collect fee',
  },
]

const STAFF_NAV = [
  { to: '/staff/gate', label: 'Gate' },
  { to: '/staff/lost-ticket', label: 'Lost Ticket' },
]

const VND = (n: number) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n))} VND`

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
      return { message: text ?? 'Parking lot full', isFull: !isDuplicate }
    }
    if (status === 404) {
      return { message: text ?? 'Parking session not found', isFull: false }
    }
    return { message: text ?? `Error (${status ?? 'network'})`, isFull: false }
  }
  return { message: 'Unknown error', isFull: false }
}

export default function Gate() {
  // Read initial tab from URL query param (e.g. ?tab=check-out from VNPAY return)
  const initialTab = (() => {
    const p = new URLSearchParams(window.location.search).get('tab')
    return p === 'check-out' ? 'check-out' : 'check-in'
  })()
  const [tab, setTab] = useState<Tab>(initialTab as Tab)
  const toasts = useToasts()
  const navigate = useNavigate()
  const user = getUser()
  const userInitial = (user?.fullName || user?.phone || 'S')[0].toUpperCase()

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-50 border-b border-slate-200/80 bg-slate-100/95 shadow-sm backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-2.5 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary-600 to-indigo-400 text-xs font-black text-white shadow-md shadow-primary-600/20">
                {userInitial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {user?.fullName || user?.phone || 'Gate Staff'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Gate Operator
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap items-center gap-1 lg:border-l lg:border-slate-300 lg:pl-3" aria-label="Staff navigation">
              {STAFF_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
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
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <nav
              className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:min-w-[240px]"
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
                    className={`group rounded-lg px-3 py-1.5 flex items-center justify-center gap-2 transition-all focus:outline-none ${
                      isActive
                        ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20'
                        : 'bg-white text-slate-700 hover:bg-primary-50 hover:text-primary-700'
                    }`}
                  >
                    <span className="text-xs font-bold">{item.title}</span>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isActive ? 'bg-emerald-400' : 'bg-slate-300 group-hover:bg-slate-400'
                      }`}
                    />
                  </button>
                )
              })}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 focus:outline-none"
            >
              Sign out
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
    toasts.showSuccess(`Plate detected: ${plate}`)
  }, [toasts])

  const handleReservationQrScanned = useCallback((decodedText: string) => {
    const code = decodedText.trim()
    setShowReservationScanner(false)
    if (!code) {
      toasts.showError('Invalid reservation QR code')
      return
    }

    setReservationId(code)
    toasts.showSuccess('Reservation ID received from QR')
  }, [toasts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licensePlate.trim()) {
      toasts.showError('Please enter the license plate')
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
      toasts.showSuccess(`Slot ${response.slot.code} assigned`)
    } catch (err) {
      const { message, isFull } = extractError(err)
      if (isFull) {
        toasts.showError(`Parking lot full: ${message}`)
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
        <h2 className="text-lg font-semibold">Check-in vehicle entry</h2>

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
            License plate <span className="text-red-500">*</span>
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
                📸 Scan license plate with camera
              </button>
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 underline underline-offset-2 transition-colors"
              >
                ✏️ Enter plate manually (fallback)
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
                    Edit
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
                      Rescan with camera
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
            Vehicle type <span className="text-red-500">*</span>
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
              <span>Car (Zone A)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="vehicleType"
                value="motorbike"
                checked={vehicleType === 'motorbike'}
                onChange={() => setVehicleType('motorbike')}
              />
              <span>Motorbike (Zone B)</span>
            </label>
          </div>
        </div>

        {/* ── Driver phone ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Driver phone <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            className="input"
            placeholder="e.g. 0901234567 — enter if the customer has an account to receive QR"
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            If the customer is registered, the system will generate a QR code for check-out.
          </p>
        </div>

        {/* ── Submit ── */}
        {(licensePlate || showManualInput) && (
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={submitting || !licensePlate.trim()}>
              {submitting ? 'Processing...' : 'Check-in'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="btn-secondary"
              disabled={submitting}
            >
              Cancel
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
      ✓ Check-in successful
      </h2>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500">License plate</dt>
        <dd className="font-medium">{data.session.licensePlate}</dd>

        <dt className="text-gray-500">Vehicle type</dt>
        <dd>{data.session.vehicleType === 'car' ? 'Car' : 'Motorbike'}</dd>

        <dt className="text-gray-500">Assigned slot</dt>
        <dd className="font-mono text-lg font-bold">{data.slot.code}</dd>

        <dt className="text-gray-500">Floor</dt>
        <dd>
          {data.slot.floor.name} (Floor {data.slot.floor.floorNumber}) — Zone {data.slot.zone}
        </dd>

        <dt className="text-gray-500">Check-in time</dt>
        <dd>{formatDateTime(data.session.checkInTime)}</dd>
      </dl>

      {data.qr_code && (
        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-medium mb-2">
            QR code for driver (registered):
          </p>
          <img
            src={data.qr_code}
            alt="QR code"
            className="w-48 h-48 border border-gray-200 rounded-md"
          />
          <p className="text-xs text-gray-500 mt-2">
            Driver presents this QR at exit for check-out.
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onNext} className="btn-primary">
          Next vehicle
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
      toasts.showError('Please enter the license plate')
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
        toasts.showError('Invalid QR code')
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
      toasts.showSuccess('Payment confirmed')
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
          ✓ Payment successful
        </h2>
        <Receipt data={receipt} />
        <div className="flex gap-2 print:hidden">
          <button onClick={handlePrint} className="btn-primary">
            Print receipt
          </button>
          <button onClick={reset} className="btn-secondary">
            Next vehicle
          </button>
        </div>
      </div>
    )
  }

  if (feePreview) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Confirm payment</h2>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-gray-500">License plate</dt>
          <dd className="font-medium">{feePreview.licensePlate}</dd>

          <dt className="text-gray-500">Slot</dt>
          <dd className="font-mono">{feePreview.slotCode}</dd>

          <dt className="text-gray-500">Check-in</dt>
          <dd>{formatDateTime(feePreview.checkInTime)}</dd>

          <dt className="text-gray-500">Check-out</dt>
          <dd>{formatDateTime(feePreview.checkOutTime)}</dd>

          <dt className="text-gray-500">Duration</dt>
          <dd>{feePreview.fee.durationHours} hour(s)</dd>
        </dl>

        <div className="border-t border-gray-200 pt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Base fee</span>
            <span>{VND(feePreview.fee.baseFee)}</span>
          </div>
          {feePreview.fee.penalty > 0 && (
            <div className="flex justify-between text-yellow-700">
              <span>
                Surcharge
                {feePreview.fee.isOvertime && ' (overtime > 24h)'}
                {feePreview.fee.isLostTicket && ' (lost ticket)'}
              </span>
              <span>{VND(feePreview.fee.penalty)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
            <span>Total</span>
            <span>{VND(feePreview.fee.total)}</span>
          </div>
        </div>

        {feePreview.fee.isOvertime && (
          <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-2">
            ⚠ This session exceeded 24 hours — overtime surcharge applied.
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleConfirmPayment}
            className="btn-primary"
            disabled={confirming}
          >
            {confirming ? 'Confirming...' : 'Confirm cash received'}
          </button>
          <button onClick={reset} className="btn-secondary" disabled={confirming}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleLookupByPlate} className="space-y-4">
      <h2 className="text-lg font-semibold">Check-out vehicle exit</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          License plate
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
          {submitting ? 'Searching...' : 'Search by plate'}
        </button>
        <button
          type="button"
          onClick={handleScanQR}
          className="btn-secondary"
          disabled={submitting}
        >
          📷 Scan QR
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Registered customers: scan QR from app. Walk-in customers: enter plate number.
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
  const [workflow, setWorkflow] = useState<CheckoutWorkflowResponse | null>(null)
  const [receipt, setReceipt] = useState<ConfirmPaymentResponse | null>(null)
  const [exitResult, setExitResult] = useState<ConfirmExitResponse | null>(null)
  const [action, setAction] = useState<'lookup' | 'checkout' | 'payment' | 'bankQr' | 'refresh' | 'exit' | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [checkOutCount, setCheckOutCount] = useState(0)
  const hydratedFromQuery = useRef(false)

  const status = workflow?.session.status
  const paymentStatus = workflow?.payment?.status ?? null
  const canRequestCheckout = status === 'active'
  const paymentExpired =
    workflow?.payment?.method === 'bank_qr' &&
    workflow.payment.status === 'pending' &&
    !!workflow.payment.expiredAt &&
    new Date(workflow.payment.expiredAt).getTime() <= Date.now()
  const isBankQrPending =
    status === 'checkout_pending' &&
    workflow?.payment?.method === 'bank_qr' &&
    workflow.payment.status === 'pending' &&
    !paymentExpired
  const isBankQrExpired =
    status === 'checkout_pending' &&
    workflow?.payment?.method === 'bank_qr' &&
    paymentExpired
  // Payment failed/cancelled on VNPAY side — allow staff to regenerate link
  const isBankQrFailed =
    status === 'checkout_pending' &&
    workflow?.payment?.method === 'bank_qr' &&
    (workflow.payment.status === 'failed' ||
      workflow.payment.status === 'cancelled' ||
      workflow.payment.status === 'expired')
  const canConfirmPayment = status === 'checkout_pending' && !isBankQrPending && !isBankQrExpired && !isBankQrFailed
  const canGenerateBankQr = status === 'checkout_pending' && !isBankQrPending && !isBankQrExpired && !isBankQrFailed
  const canConfirmExit = status === 'exit_authorized'
  const isCompleted = status === 'completed'

  const mergePaymentWorkflow = (data: PaymentWorkflowResponse) => {
    setWorkflow((current) =>
      current
        ? {
            ...current,
            session: { ...current.session, ...data.session },
            slot: { ...current.slot, ...data.slot },
            payment: data.payment,
          }
        : current,
    )
  }

  const buildReceiptFromWorkflow = (
    current: CheckoutWorkflowResponse,
    checkOutTime: string,
  ): ConfirmPaymentResponse | null => {
    if (!current.payment || current.payment.status !== 'paid' || !current.payment.paidAt) {
      return null
    }

    return {
      sessionId: current.session.id,
      licensePlate: current.session.licensePlate,
      vehicleType: current.session.vehicleType,
      checkInTime: current.session.checkInTime,
      checkOutTime,
      durationHours: current.fee.durationHours,
      slotCode: current.slot.code,
      fee: current.fee,
      paymentId: current.payment.id,
      paymentMethod: current.payment.method,
      paymentStatus: current.payment.status,
      exitAuthorizationStatus: current.session.status,
      paidAt: current.payment.paidAt,
    }
  }

  const reset = () => {
    setSessionCode('')
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
      toasts.showError('Please enter a Session Code/QR or license plate to look up.')
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
        toasts.showInfo('This session has already completed checkout.')
      } else {
        toasts.showSuccess('Session loaded.')
      }
    } catch (err) {
      const { message } = extractError(err)
      toasts.showError(message || 'Session not found.')
    } finally {
      setAction(null)
    }
  }

  useEffect(() => {
    if (hydratedFromQuery.current) return
    hydratedFromQuery.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('sessionCode') || params.get('session')
    const plate = params.get('licensePlate')

    if (code) {
      setSessionCode(code)
      void lookupSession({ sessionCode: code })
      return
    }

    if (plate) {
      const normalizedPlate = plate.trim().toUpperCase()
      setSessionCode(normalizedPlate)
      void lookupSession({ licensePlate: normalizedPlate })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLookupBySession = (event: React.FormEvent) => {
    event.preventDefault()
    lookupSession({ sessionCode })
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

  const handleGenerateBankQr = async () => {
    if (!workflow) return
    setAction('bankQr')
    try {
      const data = await createBankQrPayment(workflow.session.id)
      mergePaymentWorkflow(data)
      setReceipt(null)
      toasts.showSuccess('Bank QR generated. Waiting for payment.')
    } catch (err) {
      const { message } = extractError(err)
      toasts.showError(message || 'Bank QR creation failed.')
    } finally {
      setAction(null)
    }
  }

  const refreshPaymentStatus = async (showToast = true) => {
    if (!workflow) return
    if (showToast) setAction('refresh')
    try {
      const data = await getPaymentStatus(workflow.session.id)
      mergePaymentWorkflow(data)
      if (data.payment?.status === 'paid' && data.session.status === 'exit_authorized') {
        toasts.showSuccess('Bank QR payment confirmed. Vehicle is authorized to exit.')
      } else if (showToast) {
        toasts.showInfo('Payment status refreshed.')
      }
    } catch (err) {
      if (showToast) {
        const { message } = extractError(err)
        toasts.showError(message || 'Payment status refresh failed.')
      }
    } finally {
      if (showToast) setAction(null)
    }
  }

  useEffect(() => {
    if (!workflow || !isBankQrPending) return

    const intervalId = window.setInterval(() => {
      void getPaymentStatus(workflow.session.id)
        .then((data) => {
          mergePaymentWorkflow(data)
          if (data.payment?.status === 'paid' && data.session.status === 'exit_authorized') {
            toasts.showSuccess('Bank QR payment confirmed. Vehicle is authorized to exit.')
          }
        })
        .catch(() => {
          // Keep polling quiet; manual refresh still shows errors.
        })
    }, 4000)

    return () => window.clearInterval(intervalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow?.session.id, isBankQrPending])

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
      setCheckOutCount((c) => c + 1)
      const completedWorkflow: CheckoutWorkflowResponse = {
        ...workflow,
        session: {
          ...workflow.session,
          status: response.session.status,
          checkOutTime: response.session.checkOutTime,
        },
        slot: {
          ...workflow.slot,
          status: response.slot.status,
        },
      }
      const finalReceipt = buildReceiptFromWorkflow(
        completedWorkflow,
        response.session.checkOutTime,
      )
      if (finalReceipt) {
        setReceipt(finalReceipt)
      }
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
  const guide = checkoutGuide(status)
  const amountDue = workflow ? VND(workflow.payment?.amount ?? workflow.fee.total) : ''

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            Exit gate workflow
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Staff Check-out</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Load the session ticket, collect payment, then release the slot only after the vehicle exits.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">
            {workflow ? readableStatus(workflow.session.status) : 'Ready'}
          </span>
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl border border-primary-200 bg-white px-4 py-2 text-sm font-black text-primary-700 transition hover:bg-primary-50"
          >
            Next Vehicle
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <section>
            <form onSubmit={handleLookupBySession} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Session ticket
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Scan QR or enter the printed session code.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="h-11 rounded-xl border border-primary-500 bg-primary-600 px-4 text-sm font-black text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  disabled={action === 'lookup'}
                >
                  Scan QR
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  className="input h-12 font-mono text-base font-black uppercase tracking-[0.08em]"
                  placeholder="PBMS-D1878BC500"
                  value={sessionCode}
                  onChange={(event) => setSessionCode(event.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn-primary h-12 whitespace-nowrap rounded-xl"
                  disabled={action === 'lookup'}
                >
                  {action === 'lookup' ? 'Loading...' : 'Lookup'}
                </button>
              </div>
            </form>
          </section>

          {workflow ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Loaded session
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <p className="font-mono text-2xl font-black tracking-[0.08em] text-slate-950">
                      {workflow.session.licensePlate}
                    </p>
                    <StatusBadge status={workflow.session.status} />
                  </div>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-500">
                    {workflow.session.sessionCode}
                  </p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-400 px-5 py-4 text-white shadow-lg shadow-primary-600/20">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-100">Amount due</p>
                  <p className="mt-1 text-3xl font-black">{VND(workflow.fee.total)}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <CheckoutMetric label="Vehicle" value={formatVehicleType(workflow.session.vehicleType)} />
                <CheckoutMetric label="Slot" value={workflow.slot.code} mono />
                <CheckoutMetric label="Floor / Zone" value={`${workflow.slot.floor.name} / Zone ${workflow.slot.zone}`} />
                <CheckoutMetric
                  label="Duration"
                  value={`${workflow.fee.durationHours} hour${workflow.fee.durationHours > 1 ? 's' : ''}`}
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Fee breakdown
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <DetailRow label="Base fee" value={VND(workflow.fee.baseFee)} />
                    <DetailRow label="Penalty" value={VND(workflow.fee.penalty)} />
                    <DetailRow label="Check-in" value={formatDateTime(workflow.session.checkInTime)} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                        Payment
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {workflow.payment ? readablePaymentMethod(workflow.payment.method) : 'Method not selected'}
                      </p>
                    </div>
                    <PaymentBadge status={paymentStatus} />
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <DetailRow
                      label="Status"
                      value={workflow.payment ? readablePaymentStatus(workflow.payment.status) : 'Not created'}
                    />
                    {workflow.payment?.paidAt ? (
                      <DetailRow label="Paid at" value={formatDateTime(workflow.payment.paidAt)} />
                    ) : null}
                  </div>
                </div>
              </div>

                {workflow.payment?.method === 'bank_qr' ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                      VNPAY Bank QR payment
                    </p>
                    {workflow.payment.qrCode ? (
                      workflow.payment.qrCode.startsWith('data:image') ? (
                        <img
                          src={workflow.payment.qrCode}
                          alt="VNPAY Bank QR"
                          className="mx-auto mt-3 h-44 w-44 rounded-xl border border-slate-200 bg-white object-contain p-2"
                        />
                      ) : (
                        <div className="mt-3 rounded-xl bg-white p-3 font-mono text-xs text-slate-700 ring-1 ring-slate-200 break-all">
                          {workflow.payment.qrCode}
                        </div>
                      )
                    ) : null}
                    {workflow.payment.checkoutUrl ? (
                      <a
                        href={workflow.payment.checkoutUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex w-full justify-center rounded-xl border border-primary-200 bg-white px-3 py-2 text-sm font-black text-primary-700 transition hover:bg-primary-50"
                      >
                        Open VNPAY Payment Page
                      </a>
                    ) : null}
                    {workflow.payment.expiredAt ? (
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        Expires at {formatDateTime(workflow.payment.expiredAt)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {workflow.fee.isOvertime || workflow.fee.isLostTicket ? (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    Fee includes penalty.
                  </p>
                ) : null}
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
                <Receipt data={receipt} sessionCode={workflow?.session.sessionCode} />
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start print:hidden">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Next staff action
                </p>
                <h3 className="mt-2 text-lg font-black tracking-tight text-slate-950">
                  {guide.title}
                </h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-700 ring-1 ring-slate-200">
                {workflow ? readableStatus(workflow.session.status) : 'Ready'}
              </span>
            </div>

            <p className="mt-3 text-sm font-semibold leading-5 text-slate-500">
              {guide.description}
            </p>

            {workflow ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <OperatorSignal
                  label="Payment"
                  value={workflow.payment ? readablePaymentStatus(workflow.payment.status) : 'Not started'}
                  tone={workflow.payment?.status === 'paid' ? 'good' : workflow.payment?.status === 'pending' ? 'warn' : 'idle'}
                />
                <OperatorSignal
                  label="Exit"
                  value={readableExitStatus(status)}
                  tone={status === 'exit_authorized' || status === 'completed' ? 'good' : status === 'checkout_pending' ? 'warn' : 'idle'}
                />
                <OperatorSignal
                  label="Slot"
                  value={readableSlotStatus(workflow.slot.status)}
                  tone={workflow.slot.status === 'available' ? 'good' : 'warn'}
                />
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs font-semibold text-slate-600">
                Scan Session QR or enter Session Code from the parking ticket.
              </div>
            )}

            <div className="mt-5 border-t border-slate-200 pt-4">
              {!workflow ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs font-bold text-slate-500">
                  Load a session first. Payment and exit actions stay hidden until then.
                </div>
              ) : null}

              {canRequestCheckout ? (
                <button
                  type="button"
                  onClick={handleRequestCheckout}
                  disabled={Boolean(action)}
                  className="h-12 w-full rounded-2xl bg-primary-600 px-4 text-sm font-black text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {action === 'checkout' ? 'Starting checkout...' : 'Calculate Fee & Start Checkout'}
                </button>
              ) : null}

              {canConfirmPayment ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <button
                      type="button"
                      onClick={handleConfirmPayment}
                      disabled={Boolean(action)}
                      className="h-12 w-full rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                    >
                      {action === 'payment' ? 'Confirming cash...' : 'Confirm Cash Payment'}
                    </button>
                    {canGenerateBankQr ? (
                      <button
                        type="button"
                        onClick={handleGenerateBankQr}
                        disabled={Boolean(action)}
                        className="h-12 w-full rounded-2xl bg-indigo-500 px-4 text-sm font-black text-white shadow-sm shadow-indigo-500/20 transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        {action === 'bankQr' ? 'Generating VNPAY QR...' : 'Generate VNPAY Payment Link'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {isBankQrFailed ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-800">
                      Payment failed / cancelled
                    </p>
                    <p className="mt-1 text-lg font-bold text-rose-950">
                      {amountDue}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-rose-700">
                      Customer cancelled or payment failed. Regenerate link or switch to cash.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateBankQr}
                    disabled={Boolean(action)}
                    className="h-12 w-full rounded-2xl bg-indigo-500 px-4 text-sm font-black text-white shadow-sm shadow-indigo-500/20 transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {action === 'bankQr' ? 'Generating new link...' : 'Regenerate VNPAY Payment Link'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPayment}
                    disabled={Boolean(action)}
                    className="h-12 w-full rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {action === 'payment' ? 'Confirming cash...' : 'Confirm Cash Payment Instead'}
                  </button>
                </div>
              ) : null}

              {isBankQrExpired ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-800">
                      VNPAY link expired
                    </p>
                    <p className="mt-1 text-lg font-bold text-orange-950">
                      {amountDue}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-orange-700">
                      Payment link has expired. Generate a new link to continue.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateBankQr}
                    disabled={Boolean(action)}
                    className="h-12 w-full rounded-2xl bg-indigo-500 px-4 text-sm font-black text-white shadow-sm shadow-indigo-500/20 transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {action === 'bankQr' ? 'Generating new link...' : 'Regenerate VNPAY Payment Link'}
                  </button>
                </div>
              ) : null}

              {isBankQrPending ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-800">
                      Waiting for VNPAY Bank QR payment
                    </p>
                    <p className="mt-1 text-lg font-bold text-blue-950">
                      {amountDue}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-blue-700">
                      Slot remains occupied. Refresh or wait for VNPAY confirmation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshPaymentStatus(true)}
                    disabled={Boolean(action)}
                    className="h-11 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {action === 'refresh' ? 'Refreshing...' : 'Refresh Payment Status'}
                  </button>
                  {workflow?.payment?.checkoutUrl ? (
                    <a
                      href={workflow.payment.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary-600 px-4 text-sm font-black text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700"
                    >
                      Open VNPAY Payment Page
                    </a>
                  ) : null}
                </div>
              ) : null}

              {canConfirmExit ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-950">
                    Payment confirmed. Vehicle is authorized to exit. Slot is still occupied until exit is confirmed.
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmExit}
                    disabled={Boolean(action)}
                    className="h-12 w-full rounded-2xl bg-primary-600 px-4 text-sm font-black text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {action === 'exit' ? 'Releasing slot...' : 'Confirm Vehicle Exited'}
                  </button>
                </div>
              ) : null}

              {isCompleted ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-950">
                    Checkout completed. Vehicle exited and slot released.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {receipt ? (
                      <button type="button" onClick={handlePrint} className="btn-secondary print:hidden shadow-sm">
                        Print Receipt
                      </button>
                    ) : null}
                    <button type="button" onClick={reset} className="btn-primary print:hidden shadow-sm">
                      Next Vehicle
                    </button>
                  </div>
                </div>
              ) : null}

              {workflow && !canRequestCheckout && !canConfirmPayment && !canConfirmExit && !isCompleted ? (
                <div className="rounded-2xl border border-rose-200/60 bg-white/80 p-4 text-xs font-bold text-rose-800 shadow-sm">
                  This session cannot continue checkout from the current status.
                </div>
              ) : null}
            </div>

            <div className={`mt-5 border-t pt-4 ${status === 'completed' ? 'border-white/10' : 'border-slate-200/50'}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] opacity-70">
                Gate Summary
              </p>
              <div className="mt-3 space-y-2 text-xs">
                <div className={`flex items-center justify-between border-b pb-1.5 last:border-0 last:pb-0 ${status === 'completed' ? 'border-white/5' : 'border-black/5'}`}>
                  <span className="opacity-70">Slot status</span>
                  <span className="font-bold">{workflow?.slot.status ?? 'Not loaded'}</span>
                </div>
                <div className={`flex items-center justify-between border-b pb-1.5 last:border-0 last:pb-0 ${status === 'completed' ? 'border-white/5' : 'border-black/5'}`}>
                  <span className="opacity-70">Exit status</span>
                  <span className="font-bold">{readableExitStatus(status)}</span>
                </div>
                <div className="flex items-center justify-between last:border-0 last:pb-0">
                  <span className="opacity-70">Exit time</span>
                  <span className="font-bold">
                    {workflow?.session.checkOutTime
                      ? formatDateTime(workflow.session.checkOutTime)
                      : exitResult?.session.checkOutTime
                        ? formatDateTime(exitResult.session.checkOutTime)
                        : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <RecentSessionsCard type="checkout" refreshTrigger={checkOutCount} />
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

function readablePaymentMethod(method: PaymentMethod) {
  const labels: Record<PaymentMethod, string> = {
    cash: 'Cash',
    bank_qr: 'Bank QR',
  }
  return labels[method]
}

function readableExitStatus(status?: SessionStatus) {
  if (status === 'exit_authorized') return 'Authorized'
  if (status === 'completed') return 'Exited'
  if (status === 'checkout_pending') return 'Waiting for payment'
  if (status === 'active') return 'Not ready'
  return 'Not loaded'
}

function readableSlotStatus(status: 'available' | 'occupied' | 'reserved' | 'maintenance') {
  const labels: Record<typeof status, string> = {
    available: 'Available',
    occupied: 'Occupied',
    reserved: 'Reserved',
    maintenance: 'Maintenance',
  }
  return labels[status]
}

function checkoutGuide(status?: SessionStatus) {
  if (status === 'active') {
    return {
      title: 'Ready to calculate fee',
      description: 'Review plate, slot, and duration. Start checkout only when the vehicle is at the exit gate.',
    }
  }
  if (status === 'checkout_pending') {
    return {
      title: 'Collect cash payment',
      description: 'Payment is pending. Confirm cash only after staff has received the full amount.',
    }
  }
  if (status === 'exit_authorized') {
    return {
      title: 'Allow vehicle exit',
      description: 'Payment is paid. Confirm vehicle exited after the car has physically left the gate.',
    }
  }
  if (status === 'completed') {
    return {
      title: 'Checkout completed',
      description: 'Vehicle exited. The parking slot has been released for the next assignment.',
    }
  }
  if (status === 'cancelled') {
    return {
      title: 'Session cancelled',
      description: 'This session cannot continue checkout. Ask a supervisor if this status is unexpected.',
    }
  }
  return {
    title: 'Scan ticket to start',
    description: 'Use the Session QR or Session Code first. Plate lookup is only a fallback for lost tickets.',
  }
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

function CheckoutMetric({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-black text-slate-950 ${mono ? 'font-mono' : ''}`}>{value}</p>
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

function OperatorSignal({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'idle' | 'warn' | 'good'
}) {
  const toneClass = {
    idle: 'bg-white/70 text-slate-600 ring-slate-200',
    warn: 'bg-amber-100 text-amber-900 ring-amber-200',
    good: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  }[tone]

  return (
    <div className={`rounded-2xl p-3 ring-1 ${toneClass}`}>
      <span className="block text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </span>
      <span className="mt-1 block text-sm font-black leading-tight">{value}</span>
    </div>
  )
}
