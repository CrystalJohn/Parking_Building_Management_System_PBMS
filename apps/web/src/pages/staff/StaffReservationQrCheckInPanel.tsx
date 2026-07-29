import { useMemo, useState, useEffect } from 'react'
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeCheck,
  CornerDownLeft,
  Keyboard,
  Loader2,
  QrCode,
  RotateCcw,
} from 'lucide-react'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatPlateForDisplay, formatVehicleType } from '../../lib/plate-format'
import {
  normalizeReservationPaymentBadge,
  normalizeReservationQrError,
  type ReservationQrBadgeLabel,
} from '../../lib/reservation-qr-errors'
import {
  type ConfirmReservationCheckInResponse,
  type ReservationScanResponse,
  type CheckoutWorkflowResponse,
  type CheckoutEvidence,
  confirmReservationCheckIn,
  scanReservationCheckIn,
  lookupSessionForCheckout,
} from '../../lib/sessions-api'
import { type useToasts } from '../../lib/use-toasts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Props = {
  onSwitchToOcr: () => void
  onRouteToCheckout?: (input: {
    checkout: CheckoutWorkflowResponse
    plateConfirmed: string
    subMode: 'PAYMENT_REQUIRED' | 'PAYMENT_PENDING' | 'READY_TO_EXIT'
    exitEvidence?: CheckoutEvidence | null
  }) => void
  toasts: ReturnType<typeof useToasts>
}

export function StaffReservationQrCheckInPanel({ onSwitchToOcr, onRouteToCheckout, toasts }: Props) {
  const [manualToken, setManualToken] = useState('')
  const [scanData, setScanData] = useState<ReservationScanResponse | null>(null)
  const [confirmData, setConfirmData] = useState<ConfirmReservationCheckInResponse | null>(null)
  const [loadingScan, setLoadingScan] = useState(false)
  const [loadingConfirm, setLoadingConfirm] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorBadgeLabel, setErrorBadgeLabel] = useState<ReservationQrBadgeLabel | null>(null)
  const [scannerEnabled, setScannerEnabled] = useState(true)

  const badgeTone = useMemo(() => {
    if (!scanData) return 'bg-muted text-muted-foreground'

    const paymentBadge = normalizeReservationPaymentBadge(scanData.paymentBadge)
    if (paymentBadge === 'Paid') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
    if (paymentBadge === 'Auto-pay') return 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
    return 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
  }, [scanData])

  const summaryTone = confirmData?.alreadyCheckedIn
    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
    : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'

  const panelStatus = confirmData
    ? confirmData.alreadyCheckedIn
      ? 'Already checked in'
      : 'Checked in'
    : scanData
      ? 'Review'
      : errorBadgeLabel
        ? errorBadgeLabel
        : loadingScan
          ? 'Loading'
          : scannerEnabled
            ? 'Scanning'
            : 'Ready'

  const reset = () => {
    setManualToken('')
    setScanData(null)
    setConfirmData(null)
    setLoadingScan(false)
    setLoadingConfirm(false)
    setErrorMessage(null)
    setErrorBadgeLabel(null)
    setScannerEnabled(true)
  }

  const restartScanner = () => {
    setScanData(null)
    setConfirmData(null)
    setLoadingScan(false)
    setLoadingConfirm(false)
    setErrorMessage(null)
    setErrorBadgeLabel(null)
    setScannerEnabled(true)
  }

  const submitToken = async (token: string) => {
    const trimmed = token.trim()
    if (!trimmed) {
      toasts.showError('Please scan or paste a reservation QR token.')
      return
    }

    setErrorMessage(null)
    setErrorBadgeLabel(null)
    setLoadingScan(true)
    try {
      const data = await scanReservationCheckIn(trimmed)
      setScanData(data)
      setConfirmData(null)
      setManualToken(trimmed)
      toasts.showSuccess(`Reservation ${data.reservationId} loaded.`)
    } catch (error) {
      try {
        const checkoutSession = await lookupSessionForCheckout({ sessionCode: trimmed })
        if (checkoutSession && onRouteToCheckout) {
          const subMode = checkoutSession.session.isPaid
            ? 'READY_TO_EXIT'
            : checkoutSession.payment?.status === 'pending'
              ? 'PAYMENT_PENDING'
              : 'PAYMENT_REQUIRED'

          toasts.showInfo(`QR code belongs to Exit Pass for vehicle ${checkoutSession.session.licensePlate}. Auto-routing to Checkout...`)
          onRouteToCheckout({
            checkout: checkoutSession,
            plateConfirmed: checkoutSession.session.licensePlate,
            subMode,
          })
          return
        }
      } catch {
        // Not a checkout session
      }

      const normalizedError = normalizeReservationQrError(error)
      setErrorBadgeLabel(normalizedError.badgeLabel)
      setErrorMessage(normalizedError.message)
      toasts.showError(normalizedError.message)
    } finally {
      setLoadingScan(false)
    }
  }

  const handleConfirm = async () => {
    if (!scanData) return

    setErrorMessage(null)
    setLoadingConfirm(true)
    try {
      const data = await confirmReservationCheckIn(scanData.reservationId)
      setConfirmData(data)
      toasts.showSuccess(data.alreadyCheckedIn ? data.message : 'Reservation check-in confirmed.')
    } catch (error) {
      const normalizedError = normalizeReservationQrError(error)
      setErrorMessage(normalizedError.message)
      toasts.showError(normalizedError.message)
    } finally {
      setLoadingConfirm(false)
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter' && scanData && !confirmData && !loadingConfirm) {
        event.preventDefault()
        void handleConfirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [scanData, confirmData, loadingConfirm])

  const handleScannerScan = (value: string) => {
    setScannerEnabled(false)
    void submitToken(value)
  }

  return (
    <Card className="border-primary/20 shadow-sm overflow-hidden">
      <CardHeader className="border-b bg-muted/20 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <QrCode className="size-4" />
              </span>
              Reservation Check-in QR
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              For pre-reserved drivers at entrance <strong>Check-in</strong>. <em>(Exit Pass QR will auto-route to Checkout).</em>
            </p>
          </div>
          <Badge variant="outline" className="bg-background whitespace-nowrap font-semibold">
            {panelStatus}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: QR Scanner View */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-slate-950/90 shadow-inner flex items-center justify-center">
              {confirmData ? (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 text-white">
                  <div className="size-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                    <BadgeCheck className="size-7" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">Check-in Confirmed</p>
                    <p className="font-mono text-sm text-slate-300 mt-0.5">{confirmData.session.sessionCode}</p>
                  </div>
                </div>
              ) : scannerEnabled ? (
                <QRScanner
                  variant="inline"
                  presentation="bare"
                  showCancelButton={false}
                  onScan={handleScannerScan}
                  onClose={() => setScannerEnabled(false)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
                  <QrCode className="size-12 mb-2 opacity-40" />
                  <p className="text-sm font-medium">Scanner Inactive</p>
                  <p className="text-xs opacity-75 mt-1">Use manual token input or restart camera</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex gap-2">
                {!scannerEnabled && !loadingScan && !confirmData && (
                  <Button type="button" variant="outline" size="sm" onClick={restartScanner} className="h-9 gap-1.5 text-xs">
                    <RotateCcw className="size-3.5" /> Scan again
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={onSwitchToOcr} className="h-9 gap-1.5 text-xs">
                  <ArrowRightLeft className="size-3.5" /> Switch to Plate OCR
                </Button>
              </div>

              {confirmData && (
                <Button type="button" onClick={reset} size="sm" className="h-9 gap-1.5 text-xs font-semibold">
                  <RotateCcw className="size-3.5" /> Next vehicle
                </Button>
              )}
            </div>
          </div>

          {/* Right Column: Manual Input & Scanned Data Details */}
          <div className="lg:col-span-6 flex flex-col gap-4 min-w-0">
            {/* Manual Token Input Card */}
            <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Keyboard className="size-3.5 text-primary" />
                Manual Reservation Code / Token
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (manualToken.trim()) {
                    setScannerEnabled(false)
                    void submitToken(manualToken)
                  }
                }}
                className="flex gap-2"
              >
                <Input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Paste reservation code or token..."
                  className="h-10 text-xs font-mono font-medium"
                />
                <Button
                  type="submit"
                  disabled={loadingScan || !manualToken.trim()}
                  size="sm"
                  className="h-10 px-4 shrink-0 font-semibold"
                >
                  {loadingScan ? <Loader2 className="size-4 animate-spin" /> : 'Load'}
                </Button>
              </form>
            </div>

            {errorMessage ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {/* Dynamic Details Area */}
            {confirmData ? (
              <div className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
                <div className={`rounded-lg border px-3 py-2 ${summaryTone}`}>
                  <p className="text-xs font-bold">
                    {confirmData.alreadyCheckedIn ? 'Already checked in' : 'Check-in confirmed successfully'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Metric label="Plate" value={formatPlateForDisplay(confirmData.session.licensePlate)} mono strong />
                  <Metric label="Slot" value={confirmData.slot.code} strong />
                  <Metric label="Vehicle type" value={formatVehicleType(confirmData.session.vehicleType)} />
                  <Metric label="Check-in time" value={formatDateTimeVN(confirmData.session.checkInTime)} />
                </div>
              </div>
            ) : scanData ? (
              <div className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Detected Plate</p>
                    <p className="font-mono text-2xl font-black text-foreground">
                      {formatPlateForDisplay(scanData.plateNumber)}
                    </p>
                  </div>
                  <Badge className={`px-2.5 py-1 text-xs font-bold ${badgeTone}`}>
                    {normalizeReservationPaymentBadge(scanData.paymentBadge)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Metric label="Driver name" value={scanData.driverName} />
                  <Metric label="Vehicle type" value={formatVehicleType(scanData.vehicleType)} />
                  <Metric label="Reserved slot" value={scanData.slotLabel} strong />
                  <Metric label="QR expiry" value={formatDateTimeVN(scanData.expiresAt)} />
                </div>

                <Button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={loadingConfirm}
                  className="h-11 w-full gap-2 font-bold text-sm"
                >
                  {loadingConfirm ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-5" />}
                  <span>Confirm Check-in</span>
                  {!loadingConfirm && (
                    <kbd className="ml-1.5 inline-flex items-center gap-1 rounded border border-primary-foreground/30 bg-primary-foreground/20 px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground shadow-xs">
                      <CornerDownLeft className="size-3.5" />
                      Enter
                    </kbd>
                  )}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/10 p-6 text-center text-muted-foreground my-auto">
                <QrCode className="size-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold text-foreground">Waiting for QR Scan or Token</p>
                <p className="text-[11px] mt-1">Scan QR code using camera on the left or paste code into the manual input box above.</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({
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
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-sm text-foreground ${mono ? 'font-mono' : ''} ${
          strong ? 'font-black tracking-[0.08em]' : 'font-semibold'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

