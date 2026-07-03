import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeCheck,
  ChevronDown,
  Loader2,
  QrCode,
  RotateCcw,
} from 'lucide-react'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatPlateForDisplay } from '../../lib/plate-format'
import {
  normalizeReservationPaymentBadge,
  normalizeReservationQrError,
  type ReservationQrBadgeLabel,
} from '../../lib/reservation-qr-errors'
import {
  type ConfirmReservationCheckInResponse,
  type ReservationScanResponse,
  confirmReservationCheckIn,
  scanReservationCheckIn,
} from '../../lib/sessions-api'
import { type useToasts } from '../../lib/use-toasts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

type Props = {
  onSwitchToOcr: () => void
  toasts: ReturnType<typeof useToasts>
}

export function StaffReservationQrCheckInPanel({ onSwitchToOcr, toasts }: Props) {
  const [manualToken, setManualToken] = useState('')
  const [scanData, setScanData] = useState<ReservationScanResponse | null>(null)
  const [confirmData, setConfirmData] = useState<ConfirmReservationCheckInResponse | null>(null)
  const [loadingScan, setLoadingScan] = useState(false)
  const [loadingConfirm, setLoadingConfirm] = useState(false)
  const [manualFallbackOpen, setManualFallbackOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorBadgeLabel, setErrorBadgeLabel] = useState<ReservationQrBadgeLabel | null>(null)
  const [scannerEnabled, setScannerEnabled] = useState(true)

  const badgeTone = useMemo(() => {
    if (!scanData) return 'bg-muted text-muted-foreground'

    const paymentBadge = normalizeReservationPaymentBadge(scanData.paymentBadge)
    if (paymentBadge === 'Paid') return 'bg-emerald-100 text-emerald-800'
    if (paymentBadge === 'Auto-pay') return 'bg-sky-100 text-sky-800'
    return 'bg-amber-100 text-amber-800'
  }, [scanData])

  const summaryTone = confirmData?.alreadyCheckedIn
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-emerald-200 bg-emerald-50 text-emerald-900'

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
    setManualFallbackOpen(false)
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

  const handleScannerScan = (value: string) => {
    setScannerEnabled(false)
    void submitToken(value)
  }

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <QrCode className="size-4" />
            </span>
            Reservation QR
          </CardTitle>
          <Badge variant="outline" className="bg-background whitespace-nowrap">
            {panelStatus}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {confirmData ? (
          <div className="space-y-5">
            <div className={`rounded-xl border px-4 py-3 ${summaryTone}`}>
              <p className="text-sm font-semibold">
                {confirmData.alreadyCheckedIn ? 'Already checked in' : 'Check-in confirmed'}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Session code
              </p>
              <p className="font-mono text-2xl font-black tracking-[0.08em] text-foreground sm:text-3xl">
                {confirmData.session.sessionCode}
              </p>
            </div>

            <Separator />

            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Metric label="Plate" value={formatPlateForDisplay(confirmData.session.licensePlate)} mono strong />
              <Metric label="Slot" value={confirmData.slot.code} />
              <Metric label="Vehicle type" value={confirmData.session.vehicleType} />
              <Metric label="Check-in time" value={formatDateTimeVN(confirmData.session.checkInTime)} />
            </div>

            <Button type="button" onClick={reset} className="h-11 w-full whitespace-nowrap sm:w-auto">
              <RotateCcw className="size-4" />
              Next vehicle
            </Button>
          </div>
        ) : scanData ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Plate
                </p>
                <p className="font-mono text-3xl font-black tracking-[0.16em] text-foreground sm:text-4xl">
                  {formatPlateForDisplay(scanData.plateNumber)}
                </p>
              </div>
              <Badge className={`w-fit whitespace-nowrap ${badgeTone}`}>
                {normalizeReservationPaymentBadge(scanData.paymentBadge)}
              </Badge>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
              Compare the real plate before confirming. Barrier remains manual.
            </div>

            <Separator />

            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Metric label="Driver name" value={scanData.driverName} />
              <Metric label="Vehicle type" value={scanData.vehicleType} />
              <Metric label="Reserved slot" value={scanData.slotLabel} />
              <Metric label="QR expiry" value={formatDateTimeVN(scanData.expiresAt)} />
            </div>

            {errorMessage ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={loadingConfirm}
                className="h-11 whitespace-nowrap"
              >
                {loadingConfirm ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                Confirm Check-in
              </Button>
              <Button type="button" variant="outline" onClick={restartScanner} className="h-11 whitespace-nowrap">
                <RotateCcw className="size-4" />
                Scan again
              </Button>
              <Button type="button" variant="ghost" onClick={onSwitchToOcr} className="h-11 whitespace-nowrap">
                <ArrowRightLeft className="size-4" />
                OCR fallback
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {scannerEnabled ? (
              <QRScanner
                variant="inline"
                presentation="bare"
                showCancelButton={false}
                onScan={handleScannerScan}
                onClose={() => setScannerEnabled(false)}
              />
            ) : loadingScan ? (
              <div className="rounded-xl border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                Loading reservation...
              </div>
            ) : null}

            {errorMessage ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {!scannerEnabled && !loadingScan ? (
                <Button type="button" variant="outline" onClick={restartScanner} className="h-11 whitespace-nowrap">
                  <RotateCcw className="size-4" />
                  Retry
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={onSwitchToOcr} className="h-11 whitespace-nowrap">
                <ArrowRightLeft className="size-4" />
                OCR fallback
              </Button>
            </div>

            <details
              open={manualFallbackOpen}
              onToggle={(event) => setManualFallbackOpen((event.currentTarget as HTMLDetailsElement).open)}
              className="rounded-xl border bg-muted/10 px-4 py-3 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
                <span>Manual token</span>
                <ChevronDown
                  className={`size-4 transition-transform ${manualFallbackOpen ? 'rotate-180' : ''}`}
                />
              </summary>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={manualToken}
                  onChange={(event) => setManualToken(event.target.value)}
                  placeholder="Signed reservation token"
                  className="h-11 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loadingScan}
                  onClick={() => {
                    setScannerEnabled(false)
                    void submitToken(manualToken)
                  }}
                  className="h-11 whitespace-nowrap sm:min-w-[156px]"
                >
                  {loadingScan ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                  Load
                </Button>
              </div>
            </details>
          </div>
        )}
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
