import { useCallback, useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Loader2,
  LogOut,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  TicketCheck,
  WalletCards,
} from 'lucide-react'
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
import { StaffCheckInPanel } from './StaffCheckInPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type Tab = 'check-in' | 'check-out'

const GATE_TABS: Array<{
  id: Tab
  title: string
  subtitle: string
  activeHint: string
  icon: typeof ArrowDownToLine
}> = [
  {
    id: 'check-in',
    title: 'Check-in',
    subtitle: 'Vehicle entry',
    activeHint: 'OCR, reserve, issue ticket',
    icon: ArrowDownToLine,
  },
  {
    id: 'check-out',
    title: 'Check-out',
    subtitle: 'Vehicle exit',
    activeHint: 'QR, plate, collect fee',
    icon: ArrowUpFromLine,
  },
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

  return (
    <div className="min-h-[calc(100svh-5rem)] bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 pb-4 pt-4 sm:px-6 print:hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Gate operations
              </h1>
              <Badge variant="outline" className="bg-background">
                Staff console
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Run entry OCR, ticket issue, payment checkout, and vehicle exit from one station.
            </p>
          </div>

          <nav
            className="grid grid-cols-2 gap-1 rounded-lg border bg-background p-1 shadow-sm lg:min-w-[360px]"
            role="tablist"
            aria-label="Gate actions"
          >
            {GATE_TABS.map((item) => {
              const isActive = tab === item.id
              const Icon = item.icon
              return (
                <Button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`gate-panel-${item.id}`}
                  variant={isActive ? 'default' : 'ghost'}
                  onClick={() => setTab(item.id)}
                  className={cn('h-10 justify-start gap-2 px-3', !isActive && 'text-muted-foreground')}
                >
                  <Icon className="size-4" />
                  <span className="flex min-w-0 flex-col items-start leading-tight">
                    <span className="text-sm font-semibold">{item.title}</span>
                    <span
                      className={cn(
                        'hidden text-[11px] font-medium lg:block',
                        isActive ? 'text-primary-foreground/75' : 'text-muted-foreground',
                      )}
                    >
                      {item.subtitle}
                    </span>
                  </span>
                </Button>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 print:max-w-none print:p-0">
        <div
          id={`gate-panel-${tab}`}
          role="tabpanel"
          className={cn(
            "print:rounded-none print:border-0 print:p-0 print:shadow-none",
          )}
        >
          {tab === 'check-in' ? (
            <StaffCheckInPanel toasts={toasts} />
          ) : (
            <CheckOutPanel toasts={toasts} />
          )}
        </div>
      </div>
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
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
        <div className="space-y-4">
          <Card className="border-primary/20 shadow-sm print:hidden">
            <CardHeader className="grid-cols-[1fr_auto] border-b bg-muted/30">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <TicketCheck className="size-4" />
                  </span>
                  Session ticket checkout
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <QrCode className="size-3.5" />
                    Session QR first
                  </span>
                  <span>Plate lookup only for lost tickets</span>
                </CardDescription>
              </div>
              <CardAction>
                <Button
                  type="button"
                  variant="outline"
                  onClick={reset}
                  disabled={Boolean(action)}
                  className="h-10 px-3"
                >
                  <RotateCcw className="size-4" />
                  Next Vehicle
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleLookupBySession}
                className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end"
              >
                <div className="space-y-2">
                  <Label htmlFor="checkout-session-code" className="text-xs font-semibold">
                    Session Code / QR
                  </Label>
                  <Input
                    id="checkout-session-code"
                    className="h-11 font-mono text-base font-semibold uppercase"
                    placeholder="PBMS-D1878BC500"
                    value={sessionCode}
                    onChange={(event) => setSessionCode(event.target.value)}
                    autoFocus
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowScanner(true)}
                  disabled={action === 'lookup'}
                  className="h-11 lg:min-w-32"
                >
                  <QrCode className="size-4" />
                  Scan QR
                </Button>
                <Button
                  type="submit"
                  disabled={action === 'lookup'}
                  className="h-11 lg:min-w-28"
                >
                  {action === 'lookup' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  {action === 'lookup' ? 'Loading...' : 'Lookup'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {workflow ? (
            <Card className="border-primary/20 shadow-sm">
              <CardHeader className="grid-cols-[1fr_auto] border-b bg-muted/30">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <ReceiptText className="size-4" />
                    </span>
                    Loaded session
                  </CardTitle>
                  <CardDescription className="font-mono">
                    {workflow.session.sessionCode}
                  </CardDescription>
                </div>
                <CardAction>
                  <StatusBadge status={workflow.session.status} />
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.45fr)]">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Vehicle plate
                    </p>
                    <p className="mt-2 break-words font-mono text-3xl font-bold text-foreground">
                      {workflow.session.licensePlate}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <CheckoutMetric label="Vehicle" value={formatVehicleType(workflow.session.vehicleType)} />
                      <CheckoutMetric label="Slot" value={workflow.slot.code} mono />
                      <CheckoutMetric
                        label="Floor / Zone"
                        value={`${workflow.slot.floor.name} / Zone ${workflow.slot.zone}`}
                      />
                      <CheckoutMetric
                        label="Duration"
                        value={`${workflow.fee.durationHours} hour${workflow.fee.durationHours > 1 ? 's' : ''}`}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-primary p-4 text-primary-foreground shadow-sm">
                    <p className="text-xs font-semibold uppercase text-primary-foreground/70">
                      Amount due
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {VND(workflow.fee.total)}
                    </p>
                    <p className="mt-2 text-sm text-primary-foreground/70">
                      {workflow.payment
                        ? `${readablePaymentMethod(workflow.payment.method)} - ${readablePaymentStatus(workflow.payment.status)}`
                        : 'Calculated fee preview'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Fee breakdown
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <DetailRow label="Base fee" value={VND(workflow.fee.baseFee)} />
                      <DetailRow label="Penalty" value={VND(workflow.fee.penalty)} />
                      <DetailRow label="Check-in" value={formatDateTime(workflow.session.checkInTime)} />
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Payment
                        </p>
                        <p className="mt-1 text-sm font-medium text-muted-foreground">
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
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                      <QrCode className="size-4 text-primary" />
                      VNPAY Bank QR payment
                    </div>
                    {workflow.payment.qrCode ? (
                      workflow.payment.qrCode.startsWith('data:image') ? (
                        <img
                          src={workflow.payment.qrCode}
                          alt="VNPAY Bank QR"
                          className="mx-auto mt-3 h-44 w-44 rounded-lg border bg-background object-contain p-2"
                        />
                      ) : (
                        <div className="mt-3 break-all rounded-lg border bg-background p-3 font-mono text-xs text-foreground">
                          {workflow.payment.qrCode}
                        </div>
                      )
                    ) : null}
                    {workflow.payment.checkoutUrl ? (
                      <Button asChild variant="outline" className="mt-3 h-11 w-full">
                        <a href={workflow.payment.checkoutUrl} target="_blank" rel="noreferrer">
                          <CreditCard className="size-4" />
                          Open VNPAY Payment Page
                        </a>
                      </Button>
                    ) : null}
                    {workflow.payment.expiredAt ? (
                      <p className="mt-2 text-xs font-medium text-muted-foreground">
                        Expires at {formatDateTime(workflow.payment.expiredAt)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {workflow.fee.isOvertime || workflow.fee.isLostTicket ? (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                    <CircleAlert className="size-4" />
                    <AlertTitle>Fee includes penalty</AlertTitle>
                    <AlertDescription className="text-amber-800">
                      Overtime or lost-ticket surcharge is included in the total amount.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed shadow-sm">
              <CardContent className="grid min-h-44 place-items-center p-8 text-center">
                <div className="space-y-2">
                  <QrCode className="mx-auto size-8 text-primary/70" />
                  <p className="text-sm font-semibold uppercase text-muted-foreground">
                    Waiting for Session Ticket
                  </p>
                  <p className="text-base font-medium text-foreground">
                    Enter Session Code or scan QR to load checkout details.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {isCompleted && receipt ? (
            <Card className="border-emerald-200 bg-emerald-50 shadow-sm">
              <CardHeader className="grid-cols-[1fr_auto]">
                <div>
                  <CardTitle className="flex items-center gap-2 text-emerald-950">
                    <CheckCircle2 className="size-5" />
                    Checkout completed
                  </CardTitle>
                  <CardDescription className="text-emerald-700">
                    Vehicle exited. Slot released.
                  </CardDescription>
                </div>
                <CardAction className="flex gap-2">
                  {receipt ? (
                    <Button type="button" variant="outline" onClick={handlePrint} className="h-10 print:hidden">
                      <Printer className="size-4" />
                      Print
                    </Button>
                  ) : null}
                  <Button type="button" onClick={reset} className="h-10 print:hidden">
                    <RotateCcw className="size-4" />
                    Next
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="print:block">
                <Receipt data={receipt} sessionCode={workflow?.session.sessionCode} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start print:hidden">
          <Card className="border-primary/20 shadow-sm">
            <CardHeader className="grid-cols-[1fr_auto] border-b bg-muted/30">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <WalletCards className="size-4" />
                  </span>
                  Next staff action
                </CardTitle>
                <CardDescription>{guide.title}</CardDescription>
              </div>
              <CardAction>
                <Badge variant="outline" className="bg-background">
                  {workflow ? readableStatus(workflow.session.status) : 'Ready'}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {guide.description}
              </p>

              {workflow ? (
                <div className="grid grid-cols-3 gap-2">
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
                <Alert className="border-dashed bg-muted/30">
                  <QrCode className="size-4" />
                  <AlertTitle>Load a session first</AlertTitle>
                  <AlertDescription>
                    Payment and exit actions appear after staff scans the ticket.
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              <div className="space-y-3">
                {canRequestCheckout ? (
                  <Button
                    type="button"
                    onClick={handleRequestCheckout}
                    disabled={Boolean(action)}
                    className="h-11 w-full"
                  >
                    {action === 'checkout' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ReceiptText className="size-4" />
                    )}
                    {action === 'checkout' ? 'Starting checkout...' : 'Calculate Fee & Start Checkout'}
                  </Button>
                ) : null}

                {canConfirmPayment ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <Button
                      type="button"
                      onClick={handleConfirmPayment}
                      disabled={Boolean(action)}
                      className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {action === 'payment' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Banknote className="size-4" />
                      )}
                      {action === 'payment' ? 'Confirming cash...' : 'Confirm Cash Payment'}
                    </Button>
                    {canGenerateBankQr ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleGenerateBankQr}
                        disabled={Boolean(action)}
                        className="h-11 w-full"
                      >
                        {action === 'bankQr' ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CreditCard className="size-4" />
                        )}
                        {action === 'bankQr' ? 'Generating VNPAY QR...' : 'Generate VNPAY Payment Link'}
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {isBankQrFailed ? (
                  <div className="space-y-3">
                    <Alert variant="destructive" className="border-rose-200 bg-rose-50">
                      <CircleAlert className="size-4" />
                      <AlertTitle>Payment failed / cancelled</AlertTitle>
                      <AlertDescription>
                        {amountDue}. Regenerate the link or switch to cash.
                      </AlertDescription>
                    </Alert>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleGenerateBankQr}
                      disabled={Boolean(action)}
                      className="h-11 w-full"
                    >
                      {action === 'bankQr' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CreditCard className="size-4" />
                      )}
                      {action === 'bankQr' ? 'Generating new link...' : 'Regenerate VNPAY Payment Link'}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleConfirmPayment}
                      disabled={Boolean(action)}
                      className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {action === 'payment' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Banknote className="size-4" />
                      )}
                      {action === 'payment' ? 'Confirming cash...' : 'Confirm Cash Payment Instead'}
                    </Button>
                  </div>
                ) : null}

                {isBankQrExpired ? (
                  <div className="space-y-3">
                    <Alert className="border-orange-200 bg-orange-50 text-orange-950">
                      <CircleAlert className="size-4" />
                      <AlertTitle>VNPAY link expired</AlertTitle>
                      <AlertDescription className="text-orange-800">
                        {amountDue}. Generate a new link to continue.
                      </AlertDescription>
                    </Alert>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleGenerateBankQr}
                      disabled={Boolean(action)}
                      className="h-11 w-full"
                    >
                      {action === 'bankQr' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CreditCard className="size-4" />
                      )}
                      {action === 'bankQr' ? 'Generating new link...' : 'Regenerate VNPAY Payment Link'}
                    </Button>
                  </div>
                ) : null}

                {isBankQrPending ? (
                  <div className="space-y-3">
                    <Alert className="border-sky-200 bg-sky-50 text-sky-950">
                      <CreditCard className="size-4" />
                      <AlertTitle>Waiting for VNPAY Bank QR payment</AlertTitle>
                      <AlertDescription className="text-sky-800">
                        {amountDue}. Slot remains occupied until payment is confirmed.
                      </AlertDescription>
                    </Alert>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void refreshPaymentStatus(true)}
                      disabled={Boolean(action)}
                      className="h-11 w-full"
                    >
                      {action === 'refresh' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      {action === 'refresh' ? 'Refreshing...' : 'Refresh Payment Status'}
                    </Button>
                    {workflow?.payment?.checkoutUrl ? (
                      <Button asChild className="h-11 w-full">
                        <a href={workflow.payment.checkoutUrl} target="_blank" rel="noreferrer">
                          <CreditCard className="size-4" />
                          Open VNPAY Payment Page
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {canConfirmExit ? (
                  <div className="space-y-3">
                    <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
                      <CheckCircle2 className="size-4" />
                      <AlertTitle>Payment confirmed</AlertTitle>
                      <AlertDescription className="text-emerald-800">
                        Vehicle is authorized to exit. Confirm only after it has left the gate.
                      </AlertDescription>
                    </Alert>
                    <Button
                      type="button"
                      onClick={handleConfirmExit}
                      disabled={Boolean(action)}
                      className="h-11 w-full"
                    >
                      {action === 'exit' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <LogOut className="size-4" />
                      )}
                      {action === 'exit' ? 'Releasing slot...' : 'Confirm Vehicle Exited'}
                    </Button>
                  </div>
                ) : null}

                {isCompleted ? (
                  <div className="space-y-3">
                    <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
                      <CheckCircle2 className="size-4" />
                      <AlertTitle>Checkout completed</AlertTitle>
                      <AlertDescription className="text-emerald-800">
                        Vehicle exited and slot released.
                      </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-2 gap-2">
                      {receipt ? (
                        <Button type="button" variant="outline" onClick={handlePrint} className="h-10">
                          <Printer className="size-4" />
                          Print
                        </Button>
                      ) : null}
                      <Button type="button" onClick={reset} className="h-10">
                        <RotateCcw className="size-4" />
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}

                {workflow && !canRequestCheckout && !canConfirmPayment && !canConfirmExit && !isCompleted ? (
                  <Alert variant="destructive">
                    <CircleAlert className="size-4" />
                    <AlertTitle>Checkout cannot continue</AlertTitle>
                    <AlertDescription>
                      This session cannot continue checkout from the current status.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Gate Summary
                </p>
                <DetailRow label="Slot status" value={workflow?.slot.status ?? 'Not loaded'} />
                <DetailRow label="Exit status" value={readableExitStatus(status)} />
                <DetailRow
                  label="Exit time"
                  value={
                    workflow?.session.checkOutTime
                      ? formatDateTime(workflow.session.checkOutTime)
                      : exitResult?.session.checkOutTime
                        ? formatDateTime(exitResult.session.checkOutTime)
                        : 'Pending'
                  }
                />
              </div>
            </CardContent>
          </Card>

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
    <div className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right ${mono ? 'font-mono' : ''} ${
          strong ? 'font-semibold text-foreground' : 'font-medium text-foreground'
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
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const tone: Record<SessionStatus, string> = {
    active: 'border-sky-200 bg-sky-50 text-sky-700',
    checkout_pending: 'border-amber-200 bg-amber-50 text-amber-700',
    exit_authorized: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    completed: 'border-border bg-muted text-muted-foreground',
    cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
  }
  return (
    <Badge variant="outline" className={cn('h-6 px-2.5 font-semibold', tone[status])}>
      {readableStatus(status)}
    </Badge>
  )
}

function PaymentBadge({ status }: { status: PaymentStatus | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="h-6 bg-muted px-2.5 font-semibold text-muted-foreground">
        No Payment
      </Badge>
    )
  }

  const tone: Record<PaymentStatus, string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    failed: 'border-rose-200 bg-rose-50 text-rose-700',
    cancelled: 'border-border bg-muted text-muted-foreground',
    expired: 'border-orange-200 bg-orange-50 text-orange-700',
  }
  return (
    <Badge variant="outline" className={cn('h-6 px-2.5 font-semibold', tone[status])}>
      {readablePaymentStatus(status)}
    </Badge>
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
    idle: 'bg-background text-muted-foreground',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone]

  return (
    <div className={cn('rounded-lg border p-3', toneClass)}>
      <span className="block text-xs font-semibold uppercase opacity-70">
        {label}
      </span>
      <span className="mt-1 block text-sm font-semibold leading-tight">{value}</span>
    </div>
  )
}
