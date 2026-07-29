import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { isAxiosError } from 'axios'
import {
  CircleAlert,
  Loader2,
  LogOut,
  Printer,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  TicketCheck,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useToasts } from '../../lib/use-toasts'
import {
  checkOut,
  confirmPayment,
  confirmCashPayment,
  confirmVehicleExited,
  createBankQrPayment,
  getPaymentStatus,
  fetchEvidenceImageBlobResult,
  lookupSessionForCheckout,
  requestCheckout,
  type CheckOutResponse,
  type CheckInEvidence,
  type CheckoutEvidence,
  type CheckoutWorkflowResponse,
  type EvidenceImageFetchStatus,
  type ConfirmExitResponse,
  type ConfirmPaymentResponse,
  type PaymentMethod,
  type PaymentWorkflowResponse,
  type PaymentStatus,
  type SessionStatus,
} from '../../lib/sessions-api'
import { Receipt } from '../../components/receipt/Receipt'
import { RequestManagerReviewDialog } from '../../components/operation-issues/RequestManagerReviewDialog'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import { RecentSessionsCard } from '../../components/ui/RecentSessionsCard'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatPlateForDisplay, formatVehicleType, normalizePlateForApi } from '../../lib/plate-format'
import { StaffOcrCheckInPanel } from './StaffOcrCheckInPanel'
import { StaffReservationQrCheckInPanel } from './StaffReservationQrCheckInPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { getCurrentGateLane, type CurrentGateAssignment } from '../../lib/gate-lanes-api'

type Tab = 'check-in' | 'check-out'
type MismatchProtectedAction = 'bankQr' | 'payment' | 'exit'

const VND = (n: number) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n))} VND`

const isUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CASH_ICON_SRC = '/cash-icon.svg'
const VNPAY_ICON_SRC = '/vnpay-logo.jpg'
type EvidenceImageState = {
  url: string | null
  status: 'idle' | 'loading' | EvidenceImageFetchStatus
  source?: 'local' | 'remote'
}

const EMPTY_EVIDENCE_IMAGE: EvidenceImageState = { url: null, status: 'idle' }

function debugLog(...args: unknown[]) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Gate/Checkout]', ...args)
  }
}

function loadEvidenceImage(
  evidence: CheckoutEvidence | CheckInEvidence | null,
  setImage: Dispatch<SetStateAction<EvidenceImageState>>,
) {
  let cancelled = false
  let objectUrl: string | null = null

  if (!evidence) {
    setImage({ url: null, status: 'missing' })
    return () => undefined
  }

  if ('localImageUrl' in evidence && evidence.localImageUrl) {
    setImage({ url: evidence.localImageUrl, status: 'loaded', source: 'local' })
    return () => undefined
  }

  const imagePath = evidence.thumbnailUrl ?? evidence.imageUrl
  if (!imagePath) {
    setImage({ url: null, status: 'missing' })
    return () => undefined
  }

  setImage({ url: null, status: 'loading' })
  void fetchEvidenceImageBlobResult(imagePath).then((result) => {
    if (cancelled) {
      if (result.url?.startsWith('blob:')) URL.revokeObjectURL(result.url)
      return
    }
    objectUrl = result.url
    setImage({ ...result, source: result.url ? 'remote' : undefined })
  })

  return () => {
    cancelled = true
    if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
  }
}

function markEvidenceImageFailed(setImage: Dispatch<SetStateAction<EvidenceImageState>>) {
  setImage((current) => {
    if (current.source === 'remote' && current.url?.startsWith('blob:')) {
      URL.revokeObjectURL(current.url)
    }
    return { url: null, status: 'failed' }
  })
}

const formatDateTime = formatDateTimeVN

function normalizeGateTab(value: string | null | undefined): Tab {
  if (value === 'check-out' || value === 'checkout') return 'check-out'
  return 'check-in'
}

interface PanelProps {
  toasts: ReturnType<typeof useToasts>
}

interface CheckOutPanelProps extends PanelProps {
  hideLookupCard?: boolean
  initialLookupKind?: 'sessionCode' | 'licensePlate'
  initialLookupValue?: string
  initialWorkflow?: CheckoutWorkflowResponse | null
  onResetToGateOps?: () => void
}

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
  const location = useLocation()
  const toasts = useToasts()
  const [laneAssignment, setLaneAssignment] = useState<CurrentGateAssignment | null>(null)
  const [laneLoading, setLaneLoading] = useState(true)
  const gateRoute = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const tab = normalizeGateTab(params.get('tab'))
    const sessionCode = params.get('sessionCode') || params.get('session')
    const licensePlate = params.get('licensePlate')
    const hasCheckoutContext = Boolean(sessionCode?.trim() || licensePlate?.trim())

    return {
      tab,
      hasCheckoutContext,
      renderLegacyCheckout: tab === 'check-out' && hasCheckoutContext,
    }
  }, [location.search])

  useEffect(() => {
    let active = true
    setLaneLoading(true)
    void getCurrentGateLane()
      .then((assignment) => {
        if (active) setLaneAssignment(assignment)
      })
      .catch(() => {
        if (active) setLaneAssignment(null)
      })
      .finally(() => {
        if (active) setLaneLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const lane = laneAssignment?.gateLane
  const vehicleLabel = lane ? formatVehicleType(lane.vehicleType) : ''
  const laneLabel = lane
    ? lane.name.toLowerCase().includes(lane.vehicleType.toLowerCase()) || lane.name.toLowerCase().includes('motobike')
      ? lane.name.replace(/\b(car|motorbike|motobike)\b/gi, vehicleLabel)
      : `${lane.name} · ${vehicleLabel}`
    : null

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Gate Operations
          </h1>
          <Badge variant="outline" className="bg-background">
            Staff console
          </Badge>
          {laneLabel ? <Badge variant="secondary">{laneLabel}</Badge> : null}
        </div>
      </header>

      <div
        id={`gate-panel-${gateRoute.renderLegacyCheckout ? 'check-out' : 'gate-operations'}`}
        role="tabpanel"
        className={cn(
          "print:rounded-none print:border-0 print:p-0 print:shadow-none",
        )}
      >
          {laneLoading ? (
            <Card className="flex min-h-48 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </Card>
          ) : !lane || !lane.isActive ? (
            <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
              <CardHeader>
                <CardTitle>Gate lane assignment required</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Contact a manager to receive an active Car or Motorbike lane assignment before using this gate.
                </p>
              </CardHeader>
            </Card>
          ) : gateRoute.renderLegacyCheckout ? (
            <CheckOutPanel toasts={toasts} />
          ) : (
            <GateOperationsPanel toasts={toasts} laneVehicleType={lane.vehicleType} />
          )}
        </div>
      </main>
  )
}

function GateOperationsPanel({ toasts, laneVehicleType }: PanelProps & { laneVehicleType: 'car' | 'motorbike' }) {
  const [mode, setMode] = useState<'scan-plate' | 'reservation-qr' | 'checkout'>('scan-plate')
  const [routedCheckout, setRoutedCheckout] = useState<{
    checkout: CheckoutWorkflowResponse
    plateConfirmed: string
    subMode: 'PAYMENT_REQUIRED' | 'PAYMENT_PENDING' | 'READY_TO_EXIT'
    exitEvidence?: CheckoutEvidence | null
  } | null>(null)

  if (mode === 'reservation-qr') {
    return (
      <StaffReservationQrCheckInPanel
        onSwitchToOcr={() => setMode('scan-plate')}
        onRouteToCheckout={(checkoutInput) => {
          setRoutedCheckout(checkoutInput)
          setMode('checkout')
        }}
        toasts={toasts}
      />
    )
  }

  if (mode === 'checkout' && routedCheckout) {
    return (
      <CheckOutPanel
        toasts={toasts}
        initialWorkflow={routedCheckout.checkout}
        initialLookupValue={normalizePlateForApi(routedCheckout.plateConfirmed)}
        initialLookupKind="licensePlate"
        hideLookupCard
        onResetToGateOps={() => {
          setRoutedCheckout(null)
          setMode('scan-plate')
        }}
      />
    )
  }

  return (
    <StaffOcrCheckInPanel
      toasts={toasts}
      laneVehicleType={laneVehicleType}
      onSwitchToReservationQr={() => setMode('reservation-qr')}
      onRouteToCheckout={(input) => {
        setRoutedCheckout(input)
        setMode('checkout')
      }}
    />
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
    lookup({ licensePlate: normalizePlateForApi(licensePlate) })
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
            <span className="flex items-center gap-2">
              {feePreview.fee.isSubscriber ? (
                <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">FREE — Subscriber</span>
              ) : (
                VND(feePreview.fee.baseFee)
              )}
            </span>
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

function CheckOutPanel({
  hideLookupCard = false,
  initialLookupKind = 'sessionCode',
  initialLookupValue = '',
  initialWorkflow = null,
  onResetToGateOps,
  toasts,
}: CheckOutPanelProps) {
  const location = useLocation()
  const [sessionCode, setSessionCode] = useState(initialLookupValue)
  const [workflow, setWorkflow] = useState<CheckoutWorkflowResponse | null>(initialWorkflow)
  const [receipt, setReceipt] = useState<ConfirmPaymentResponse | null>(null)
  const [exitResult, setExitResult] = useState<ConfirmExitResponse | null>(null)
  const [action, setAction] = useState<'lookup' | 'checkout' | 'payment' | 'bankQr' | 'refresh' | 'exit' | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [checkOutCount, setCheckOutCount] = useState(0)
  const hydratedQueryRef = useRef<string | null>(null)

  const status = workflow?.session.status
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
  const canConfirmPayment = status === 'checkout_pending'
  const canGenerateBankQr = status === 'checkout_pending' && !isBankQrPending && !isBankQrExpired && !isBankQrFailed
  const canConfirmExit = status === 'exit_authorized'
  const isCompleted = status === 'completed'
  const lookupLabel = initialLookupKind === 'licensePlate' ? 'License plate' : 'Session Code / QR'
  const lookupPlaceholder = initialLookupKind === 'licensePlate' ? '59A12345' : 'PBMS-D1878BC500'

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
    onResetToGateOps?.()
  }

  const normalizeSessionCode = (value: string) => {
    const trimmed = value.trim()
    return trimmed.toUpperCase().startsWith('PBMS-') ? trimmed.toUpperCase() : trimmed
  }

  const [entryEvidenceImage, setEntryEvidenceImage] = useState<EvidenceImageState>(EMPTY_EVIDENCE_IMAGE)
  const [exitEvidenceImage, setExitEvidenceImage] = useState<EvidenceImageState>(EMPTY_EVIDENCE_IMAGE)
  const [plateMismatchDialogAction, setPlateMismatchDialogAction] = useState<MismatchProtectedAction | null>(null)
  const [approvedMismatchAction, setApprovedMismatchAction] = useState<MismatchProtectedAction | null>(null)

  useEffect(() => {
    return loadEvidenceImage(workflow?.checkInEvidence ?? null, setEntryEvidenceImage)
  }, [workflow?.checkInEvidence])

  useEffect(() => {
    return loadEvidenceImage(workflow?.exitEvidence ?? null, setExitEvidenceImage)
  }, [workflow?.exitEvidence])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      if (event.key === 'Enter' && canConfirmPayment && !action) {
        event.preventDefault()
        void handleConfirmPayment()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canConfirmPayment, action])

  const lookupSession = async (input: { sessionCode?: string; licensePlate?: string }) => {
    const code = input.sessionCode ? normalizeSessionCode(input.sessionCode) : ''
    const plate = normalizePlateForApi(input.licensePlate)
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
    setSessionCode(initialLookupValue)
  }, [initialLookupValue])

  useEffect(() => {
    setWorkflow(initialWorkflow)
  }, [initialWorkflow])

  useEffect(() => {
    if (hideLookupCard) return
    if (hydratedQueryRef.current === location.search) return
    hydratedQueryRef.current = location.search

    const params = new URLSearchParams(location.search)
    const code = params.get('sessionCode') || params.get('session')
    const plate = params.get('licensePlate')

    if (code) {
      setSessionCode(code)
      void lookupSession({ sessionCode: code })
      return
    }

    if (plate) {
      const normalizedPlate = normalizePlateForApi(plate)
      setSessionCode(normalizedPlate)
      void lookupSession({ licensePlate: normalizedPlate })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideLookupCard, location.search])

  const handleLookupBySession = (event: React.FormEvent) => {
    event.preventDefault()
    if (initialLookupKind === 'licensePlate') {
      lookupSession({ licensePlate: sessionCode })
      return
    }

    lookupSession({ sessionCode })
  }

  const handleQRScanned = useCallback((decodedText: string) => {
    const code = decodedText.trim()
    setShowScanner(false)
    if (!code) {
      toasts.showError('Invalid QR code.')
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
      setWorkflow({
        ...data,
        checkInEvidence: data.checkInEvidence ?? workflow.checkInEvidence,
        exitEvidence: data.exitEvidence ?? workflow.exitEvidence ?? null,
      })
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
    if (hasPlateMismatch && approvedMismatchAction !== 'bankQr') {
      setPlateMismatchDialogAction('bankQr')
      return
    }
    if (approvedMismatchAction === 'bankQr') setApprovedMismatchAction(null)
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
    if (hasPlateMismatch && approvedMismatchAction !== 'payment') {
      setPlateMismatchDialogAction('payment')
      return
    }
    if (approvedMismatchAction === 'payment') setApprovedMismatchAction(null)
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
    if (hasPlateMismatch && approvedMismatchAction !== 'exit') {
      setPlateMismatchDialogAction('exit')
      return
    }
    if (approvedMismatchAction === 'exit') setApprovedMismatchAction(null)
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
  const handleOpenVnpay = () => {
    if (workflow?.payment?.checkoutUrl) {
      window.open(workflow.payment.checkoutUrl, '_blank', 'noopener,noreferrer')
      return
    }

    void refreshPaymentStatus(true)
  }

  const amountDue = workflow ? VND(workflow.payment?.amount ?? workflow.fee.total) : ''
  const plateDisplay = workflow ? formatPlateForDisplay(workflow.session.licensePlate) : ''
  const durationLabel = workflow ? `${workflow.fee.durationHours}h` : ''
  const paymentMethod = workflow?.payment?.method ?? null
  const paymentFact = workflow
    ? workflow.payment
      ? readablePaymentStatus(workflow.payment.status)
      : 'Not started'
    : 'Not loaded'
  const paymentLabel = workflow?.payment
    ? `${readablePaymentMethod(workflow.payment.method)} · ${readablePaymentStatus(workflow.payment.status)}`
    : 'Calculated fee preview'
  const checkInPlateNormalized = normalizePlateForApi(
    workflow?.checkInEvidence?.confirmedPlate ??
      workflow?.checkInEvidence?.ocrPlate ??
      workflow?.session.licensePlate,
  )
  const checkOutPlateNormalized = normalizePlateForApi(
    workflow?.exitEvidence?.confirmedPlate ?? workflow?.exitEvidence?.ocrPlate,
  )
  const plateMatchState: 'matched' | 'mismatch' | 'not_verified' =
    !checkOutPlateNormalized
      ? 'not_verified'
      : checkInPlateNormalized === checkOutPlateNormalized
        ? 'matched'
        : 'mismatch'
  const hasPlateMismatch = plateMatchState === 'mismatch'
  const showRecentHistory = !workflow
  const showInvalidState =
    workflow && !canRequestCheckout && !canConfirmPayment && !canConfirmExit && !isCompleted && !isBankQrPending && !isBankQrExpired && !isBankQrFailed
  const managerReviewType =
    isBankQrFailed || isBankQrExpired || workflow?.payment?.status === 'pending'
      ? 'payment_issue'
      : 'manual_review'
  const managerReviewNote = workflow
    ? `Review checkout case for ${plateDisplay}. Session status: ${workflow.session.status}. Payment status: ${workflow.payment?.status ?? 'not_started'}.`
    : ''
  const continuePlateMismatchAction = () => {
    const pending = plateMismatchDialogAction
    if (!pending) return
    setApprovedMismatchAction(pending)
    setPlateMismatchDialogAction(null)
    queueMicrotask(() => {
      if (pending === 'bankQr') void handleGenerateBankQr()
      if (pending === 'payment') void handleConfirmPayment()
      if (pending === 'exit') void handleConfirmExit()
    })
  }

  return (
    <div className="space-y-4">
      {!hideLookupCard ? (
        <Card className="border-primary/20 shadow-sm print:hidden">
          <CardHeader className="grid-cols-[1fr_auto] border-b bg-muted/30">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <TicketCheck className="size-4" />
                </span>
                Checkout lookup
              </CardTitle>
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
                Reset
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
                  {lookupLabel}
                </Label>
                <Input
                  id="checkout-session-code"
                  className="h-11 font-mono text-base font-semibold uppercase"
                  placeholder={lookupPlaceholder}
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
      ) : null}

      {workflow ? (
        <Card className="overflow-hidden border-primary/20 shadow-sm">
          <CardContent className="space-y-6 p-7 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {hideLookupCard ? 'Checkout detected' : 'Plate'}
                </p>
                <p className="mt-2 break-words font-mono text-3xl font-black tracking-[0.12em] text-foreground sm:text-4xl">
                  {plateDisplay}
                </p>
              </div>
              <StatusBadge status={workflow.session.status} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)] lg:items-start">
              <div className="space-y-4">
                <div className="rounded-2xl border bg-card px-5 py-5 text-card-foreground shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Fee
                    </p>
                    {(workflow.fee.hasReservation || workflow.session.reservationId) && (
                      <Badge className="border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        20% Reservation Discount
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-4xl font-black tracking-tight">
                    {amountDue}
                  </p>
                  {workflow.fee.originalBaseFee && workflow.fee.reservationDiscountAmount ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Original: <span className="line-through">{VND(workflow.fee.originalBaseFee)}</span>
                      <span className="ml-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                        (-{VND(workflow.fee.reservationDiscountAmount)})
                      </span>
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                    {paymentMethod ? (
                      <PaymentMethodIcon method={paymentMethod} size={18} decorative />
                    ) : null}
                    <span>{paymentLabel}</span>
                  </div>
                </div>

                <div className="lg:hidden">
                  <SessionSummary
                    workflow={workflow}
                    paymentMethod={paymentMethod}
                    paymentFact={paymentFact}
                    durationLabel={durationLabel}
                    exitTime={exitResult?.session.checkOutTime ?? workflow.session.checkOutTime}
                    plateMatchState={plateMatchState}
                  />
                </div>

                <EvidenceComparison
                  entryEvidence={workflow.checkInEvidence}
                  entryImage={entryEvidenceImage}
                  exitEvidence={workflow.exitEvidence ?? null}
                  exitImage={exitEvidenceImage}
                  onEntryImageError={() => markEvidenceImageFailed(setEntryEvidenceImage)}
                  onExitImageError={() => markEvidenceImageFailed(setExitEvidenceImage)}
                />
                {hasPlateMismatch ? (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                    <CircleAlert className="size-4" />
                    <AlertTitle>Plate mismatch detected</AlertTitle>
                    <AlertDescription className="text-amber-800">
                      Review both captures before continuing.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>

              <div className="hidden lg:block">
                <SessionSummary
                  workflow={workflow}
                  paymentMethod={paymentMethod}
                  paymentFact={paymentFact}
                  durationLabel={durationLabel}
                  exitTime={exitResult?.session.checkOutTime ?? workflow.session.checkOutTime}
                  plateMatchState={plateMatchState}
                />
              </div>
            </div>

            {workflow.payment?.method === 'bank_qr' && workflow.payment.qrCode ? (
              <div className="rounded-xl border bg-muted/20 p-4">
                {workflow.payment.qrCode.startsWith('data:image') ? (
                  <img
                    src={workflow.payment.qrCode}
                    alt="VNPAY Bank QR"
                    className="mx-auto h-44 w-44 rounded-lg border bg-background object-contain p-2"
                  />
                ) : (
                  <div className="break-all rounded-lg border bg-background p-3 font-mono text-xs text-foreground">
                    {workflow.payment.qrCode}
                  </div>
                )}
                {workflow.payment.expiredAt ? (
                  <p className="mt-3 text-xs font-medium text-muted-foreground">
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

            {isBankQrFailed ? (
              <Alert variant="destructive" className="border-rose-200 bg-rose-50">
                <CircleAlert className="size-4" />
                <AlertTitle>Payment failed / cancelled</AlertTitle>
                <AlertDescription>{amountDue}. Generate a new VNPAY link or switch to cash.</AlertDescription>
              </Alert>
            ) : null}

            {isBankQrExpired ? (
              <Alert className="border-orange-200 bg-orange-50 text-orange-950">
                <CircleAlert className="size-4" />
                <AlertTitle>VNPAY link expired</AlertTitle>
                <AlertDescription className="text-orange-800">
                  {amountDue}. Generate a new link to continue.
                </AlertDescription>
              </Alert>
            ) : null}

            {showInvalidState ? (
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertTitle>Checkout cannot continue</AlertTitle>
                <AlertDescription>This session cannot continue from the current status.</AlertDescription>
              </Alert>
            ) : null}

            {isCompleted ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
                <p className="text-sm font-semibold">Checkout completed</p>
                <p className="mt-1 text-sm text-emerald-800">Vehicle exited. Slot released.</p>
              </div>
            ) : null}

            <div className="sticky bottom-0 -mx-7 border-t bg-background/95 px-7 pb-2 pt-5 backdrop-blur print:hidden sm:-mx-8 sm:px-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row">
                  {!isCompleted ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={reset}
                      disabled={Boolean(action)}
                      className="h-11"
                    >
                      <RotateCcw className="size-4" />
                      Reset
                    </Button>
                  ) : null}
                  {receipt ? (
                    <Button type="button" variant="outline" onClick={handlePrint} className="h-11">
                      <Printer className="size-4" />
                      Print
                    </Button>
                  ) : null}
                  {!isCompleted ? (
                    <RequestManagerReviewDialog
                      defaultType={managerReviewType}
                      defaultSeverity={isBankQrFailed || showInvalidState ? 'critical' : 'warning'}
                      defaultNote={managerReviewNote}
                      sessionId={workflow.session.id}
                      paymentId={workflow.payment?.id}
                      slotId={workflow.slot.id}
                      plateNumber={workflow.session.licensePlate}
                    />
                  ) : null}
                  {canConfirmPayment && canGenerateBankQr ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGenerateBankQr}
                      disabled={Boolean(action)}
                      className="h-11"
                    >
                      {action === 'bankQr' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <img src={VNPAY_ICON_SRC} alt="" aria-hidden="true" className="size-5 object-contain" />
                      )}
                      {action === 'bankQr' ? 'Generating...' : 'Generate VNPAY'}
                    </Button>
                  ) : null}
                  {isBankQrPending ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void refreshPaymentStatus(true)}
                      disabled={Boolean(action)}
                      className="h-11"
                    >
                      {action === 'refresh' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <img src={VNPAY_ICON_SRC} alt="" aria-hidden="true" className="size-5 object-contain" />
                      )}
                      {action === 'refresh' ? 'Refreshing...' : 'Refresh VNPAY'}
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {canRequestCheckout ? (
                    <Button
                      type="button"
                      onClick={handleRequestCheckout}
                      disabled={Boolean(action)}
                      className="h-11 min-w-[190px]"
                    >
                      {action === 'checkout' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ReceiptText className="size-4" />
                      )}
                      {action === 'checkout' ? 'Starting checkout...' : 'Start Checkout'}
                    </Button>
                  ) : null}

                  {canConfirmPayment ? (
                    <Button
                      type="button"
                      onClick={handleConfirmPayment}
                      disabled={Boolean(action)}
                      className="h-11 min-w-[220px] bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {action === 'payment' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <img src={CASH_ICON_SRC} alt="" aria-hidden="true" className="size-5 object-contain" />
                      )}
                      <span>{action === 'payment' ? 'Confirming cash...' : 'Confirm Cash Payment'}</span>
                      <kbd className="pointer-events-none ml-2 hidden items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/90 sm:inline-flex">
                        <span className="text-xs">↵</span> Enter
                      </kbd>
                    </Button>
                  ) : null}

                  {isBankQrPending ? (
                    <Button
                      type="button"
                      onClick={handleOpenVnpay}
                      disabled={Boolean(action) && action !== 'refresh'}
                      className="h-11 min-w-[220px]"
                    >
                      <img src={VNPAY_ICON_SRC} alt="" aria-hidden="true" className="size-5 object-contain" />
                      Open VNPAY
                    </Button>
                  ) : null}

                  {isBankQrExpired || isBankQrFailed ? (
                    <Button
                      type="button"
                      onClick={handleGenerateBankQr}
                      disabled={Boolean(action)}
                      className="h-11 min-w-[220px]"
                    >
                      {action === 'bankQr' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <img src={VNPAY_ICON_SRC} alt="" aria-hidden="true" className="size-5 object-contain" />
                      )}
                      {action === 'bankQr' ? 'Refreshing VNPAY...' : 'Open / Refresh VNPAY'}
                    </Button>
                  ) : null}

                  {canConfirmExit ? (
                    <Button
                      type="button"
                      onClick={handleConfirmExit}
                      disabled={Boolean(action)}
                      className="h-11 min-w-[200px]"
                    >
                      {action === 'exit' ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <LogOut className="size-4" />
                      )}
                      {action === 'exit' ? 'Confirming exit...' : 'Confirm Exit'}
                    </Button>
                  ) : null}

                  {isCompleted ? (
                    <Button type="button" onClick={reset} className="h-11 min-w-[180px]">
                      <RotateCcw className="size-4" />
                      Next Vehicle
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed shadow-sm">
          <CardContent className="grid min-h-44 place-items-center p-8 text-center">
            <div className="space-y-2">
              <QrCode className="mx-auto size-8 text-primary/70" />
              <p className="text-sm font-semibold uppercase text-muted-foreground">
                Waiting for session
              </p>
              <p className="text-base font-medium text-foreground">
                Enter Session Code or scan QR.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isCompleted && receipt ? (
        <Card className="hidden print:block">
          <CardContent>
            <Receipt data={receipt} sessionCode={workflow?.session.sessionCode} />
          </CardContent>
        </Card>
      ) : null}

      {showRecentHistory ? (
        <details className="rounded-xl border bg-background px-4 py-3 print:hidden [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground">
            Recent check-out history
          </summary>
          <div className="mt-4">
            <RecentSessionsCard type="checkout" refreshTrigger={checkOutCount} />
          </div>
        </details>
      ) : null}

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

      <AlertDialog
        open={plateMismatchDialogAction !== null}
        onOpenChange={(open) => !open && setPlateMismatchDialogAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Plate mismatch detected</AlertDialogTitle>
            <AlertDialogDescription>
              Review both captures before continuing with this checkout action.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 rounded-xl border bg-muted/35 p-3 text-sm">
            <MismatchFact
              label="Check-in plate"
              value={formatPlateForDisplay(checkInPlateNormalized) || 'Not available'}
            />
            <MismatchFact
              label="Check-out plate"
              value={formatPlateForDisplay(checkOutPlateNormalized) || 'Not verified'}
            />
            <MismatchFact
              label="Session code"
              value={workflow?.session.sessionCode ?? 'Not available'}
              mono
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {workflow ? (
              <RequestManagerReviewDialog
                defaultType="ocr_mismatch"
                defaultSeverity="warning"
                defaultNote={`Plate mismatch detected for ${plateDisplay}. Check-in plate: ${formatPlateForDisplay(checkInPlateNormalized) || 'N/A'}. Check-out plate: ${formatPlateForDisplay(checkOutPlateNormalized) || 'N/A'}.`}
                sessionId={workflow.session.id}
                paymentId={workflow.payment?.id}
                slotId={workflow.slot.id}
                plateNumber={workflow.session.licensePlate}
                trigger={
                  <AlertDialogAction asChild variant="outline">
                    <Button type="button" variant="outline">Request Manager Review</Button>
                  </AlertDialogAction>
                }
              />
            ) : null}
            <AlertDialogAction onClick={continuePlateMismatchAction}>
              Continue with Staff Override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
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

function readableVehicleType(vehicleType: 'car' | 'motorbike') {
  return vehicleType === 'car' ? 'Car' : 'Motorbike'
}

function getTicketTypeLabel(workflow: CheckoutWorkflowResponse) {
  if (workflow.session.isLostTicket) return 'Lost ticket'
  if (
    workflow.session.reservationId ||
    workflow.session.allocationStrategy?.toLowerCase().includes('reservation')
  ) {
    return 'Reservation QR'
  }
  return 'Walk-in ticket'
}

function getPenaltyLabel(workflow: CheckoutWorkflowResponse) {
  if (!workflow.fee.penalty) return VND(0)

  const reasons = [
    workflow.fee.isOvertime ? 'Overtime' : null,
    workflow.fee.isLostTicket ? 'Lost ticket' : null,
  ].filter(Boolean)

  return `${VND(workflow.fee.penalty)}${reasons.length ? ` (${reasons.join(' + ')})` : ''}`
}

function PlateMatchBadge({
  state,
}: {
  state: 'matched' | 'mismatch' | 'not_verified'
}) {
  const className =
    state === 'matched'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : state === 'mismatch'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'
  const label =
    state === 'matched' ? 'Matched' : state === 'mismatch' ? 'Mismatch' : 'Not verified'

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}

function SessionSummary({
  workflow,
  paymentMethod,
  paymentFact,
  durationLabel,
  exitTime,
  plateMatchState,
}: {
  workflow: CheckoutWorkflowResponse
  paymentMethod: PaymentMethod | null
  paymentFact: string
  durationLabel: string
  exitTime: string | null
  plateMatchState: 'matched' | 'mismatch' | 'not_verified'
}) {
  const ticketType = getTicketTypeLabel(workflow)
  const penaltyLabel = getPenaltyLabel(workflow)
  const hasPenalty = Boolean(workflow.fee.penalty && workflow.fee.penalty > 0)

  return (
    <div className="rounded-2xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Session summary
        </p>
        <Badge variant="outline" className="h-5 font-semibold bg-primary/5 text-primary border-primary/20">
          Slot {workflow.slot.code}
        </Badge>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <SummaryRow label="Session code" value={workflow.session.sessionCode} mono strong />
        <SummaryRow label="Vehicle type" value={readableVehicleType(workflow.session.vehicleType)} />
        <SummaryRow
          label="Driver"
          value={
            workflow.session.driverName ? (
              <span className="font-semibold text-foreground">
                {workflow.session.driverName}
                {workflow.session.driverPhone && (
                  <span className="ml-1 font-normal text-muted-foreground">({workflow.session.driverPhone})</span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Walk-in Guest</span>
            )
          }
        />
        <SummaryRow label="Ticket type" value={ticketType} />
        {(workflow.fee.hasReservation || workflow.session.reservationId) && (
          <SummaryRow
            label="Discount"
            value={
              <Badge className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                -20% (Reservation)
              </Badge>
            }
          />
        )}
        <SummaryRow label="Plate match" value={<PlateMatchBadge state={plateMatchState} />} />
        <SummaryRow label="Check-in time" value={formatDateTimeVN(workflow.session.checkInTime)} />
        <SummaryRow label="Duration" value={durationLabel} />
        <SummaryRow
          label="Payment status"
          value={
            paymentMethod ? (
              <span className="inline-flex items-center justify-end gap-2">
                <PaymentMethodIcon method={paymentMethod} size={18} decorative />
                <span>{paymentFact}</span>
              </span>
            ) : (
              paymentFact
            )
          }
        />
        <SummaryRow label="Floor / Zone" value={`${workflow.slot.floor.name} / Zone ${workflow.slot.zone}`} />
        
        {hasPenalty ? (
          <>
            <SummaryRow label="Base fee" value={
              workflow.fee.isSubscriber
                ? <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">FREE — Subscriber</span>
                : VND(workflow.fee.baseFee)
            } />
            <SummaryRow label="Penalty" value={penaltyLabel} />
          </>
        ) : null}

        {workflow.payment?.paidAt ? (
          <SummaryRow label="Paid at" value={formatDateTime(workflow.payment.paidAt)} />
        ) : null}
        {exitTime ? <SummaryRow label="Exit time" value={formatDateTime(exitTime)} /> : null}
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  mono = false,
  strong = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  strong?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'max-w-[60%] text-right font-medium text-foreground',
          mono && 'font-mono',
          strong && 'font-semibold',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function MismatchFact({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'max-w-[60%] text-right font-medium text-foreground',
          mono && 'font-mono',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function PaymentMethodIcon({
  method,
  size = 20,
  decorative = false,
}: {
  method: PaymentMethod
  size?: number
  decorative?: boolean
}) {
  const src = method === 'cash' ? CASH_ICON_SRC : VNPAY_ICON_SRC
  const alt = decorative ? '' : method === 'cash' ? 'Cash' : 'VNPAY'

  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={decorative ? 'true' : undefined}
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  )
}

function EvidenceComparison({
  entryEvidence,
  entryImage,
  exitEvidence,
  exitImage,
  onEntryImageError,
  onExitImageError,
}: {
  entryEvidence: CheckInEvidence | null
  entryImage: EvidenceImageState
  exitEvidence: CheckoutEvidence | null
  exitImage: EvidenceImageState
  onEntryImageError: () => void
  onExitImageError: () => void
}) {
  return (
    <div className="rounded-2xl border bg-muted/15 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <EvidencePanel
          title="CHECK-IN EVIDENCE"
          evidence={entryEvidence}
          image={entryImage}
          emptyText="No evidence"
          onImageError={onEntryImageError}
        />
        <EvidencePanel
          title="CHECK-OUT EVIDENCE"
          evidence={exitEvidence}
          image={exitImage}
          emptyText="No evidence"
          onImageError={onExitImageError}
        />
      </div>
    </div>
  )
}

function EvidencePanel({
  title,
  evidence,
  image,
  emptyText,
  onImageError,
}: {
  title: string
  evidence: CheckInEvidence | CheckoutEvidence | null
  image: EvidenceImageState
  emptyText: string
  onImageError: () => void
}) {
  const plate = evidence?.ocrPlate ? formatPlateForDisplay(evidence.ocrPlate) : null
  const confidence = evidence?.ocrConfidence != null ? `${Math.round(evidence.ocrConfidence * 100)}%` : null
  const timestamp = evidence?.capturedAt ? formatDateTime(evidence.capturedAt) : null
  const message = evidenceStatusLabel(image.status, Boolean(evidence), emptyText)

  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </p>
        <Badge variant={image.status === 'loaded' ? 'secondary' : 'outline'} className="h-5">
          {image.status === 'loading' ? 'Loading' : image.status === 'loaded' ? 'Image' : 'No image'}
        </Badge>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
        {image.url ? (
          <img
            src={image.url}
            alt={`${title}${plate ? ` for plate ${plate}` : ''}`}
            className="h-32 w-full rounded-lg border object-cover sm:h-28"
            onError={onImageError}
          />
        ) : (
          <div className="grid h-32 place-items-center rounded-lg border border-dashed bg-muted/40 p-3 text-center text-xs font-medium text-muted-foreground sm:h-28">
            {message}
          </div>
        )}
        <div className="min-w-0 space-y-2 text-sm">
          <EvidenceFact label="Plate" value={plate ?? 'Unknown'} mono={Boolean(plate)} />
          <EvidenceFact label="Confidence" value={confidence ?? 'Not available'} />
          <EvidenceFact label="CAPTURED AT" value={timestamp ?? 'Not available'} />
        </div>
      </div>
    </div>
  )
}

function EvidenceFact({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-0.5 truncate font-semibold text-foreground', mono && 'font-mono')}>
        {value}
      </p>
    </div>
  )
}

function evidenceStatusLabel(status: EvidenceImageState['status'], hasEvidence: boolean, emptyText: string) {
  if (!hasEvidence) return emptyText
  if (status === 'loading') return 'Loading image'
  if (status === 'expired') return 'Image expired'
  if (status === 'failed') return 'Image unavailable'
  if (status === 'missing') return 'Image not stored'
  return 'Image unavailable'
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
