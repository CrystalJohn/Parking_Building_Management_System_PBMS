import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeCheck,
  ChevronDown,
  Loader2,
  QrCode,
  RotateCcw,
  ScanLine,
} from 'lucide-react'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import {
  type ConfirmReservationCheckInResponse,
  type ReservationScanResponse,
  confirmReservationCheckIn,
  scanReservationCheckIn,
} from '../../lib/sessions-api'
import { type useToasts } from '../../lib/use-toasts'
import { formatDateTimeVN } from '../../lib/date-time'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

type Props = {
  onSwitchToOcr: () => void
  toasts: ReturnType<typeof useToasts>
}

export function StaffReservationQrCheckInPanel({ onSwitchToOcr, toasts }: Props) {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [scanData, setScanData] = useState<ReservationScanResponse | null>(null)
  const [confirmData, setConfirmData] = useState<ConfirmReservationCheckInResponse | null>(null)
  const [loadingScan, setLoadingScan] = useState(false)
  const [loadingConfirm, setLoadingConfirm] = useState(false)
  const [manualFallbackOpen, setManualFallbackOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const badgeTone = useMemo(() => {
    if (!scanData) return 'bg-muted text-muted-foreground'
    if (scanData.paymentBadge === 'Đã thanh toán') return 'bg-emerald-100 text-emerald-800'
    if (scanData.paymentBadge === 'Auto-pay') return 'bg-sky-100 text-sky-800'
    return 'bg-amber-100 text-amber-800'
  }, [scanData])

  const summaryTone = confirmData?.alreadyCheckedIn
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-emerald-200 bg-emerald-50 text-emerald-900'

  const reset = () => {
    setManualToken('')
    setScanData(null)
    setConfirmData(null)
    setLoadingScan(false)
    setLoadingConfirm(false)
    setScannerOpen(false)
    setManualFallbackOpen(false)
    setErrorMessage(null)
  }

  const submitToken = async (token: string) => {
    const trimmed = token.trim()
    if (!trimmed) {
      toasts.showError('Please scan or paste a reservation QR token')
      return
    }

    setErrorMessage(null)
    setLoadingScan(true)
    try {
      const data = await scanReservationCheckIn(trimmed)
      setScanData(data)
      setConfirmData(null)
      setManualToken(trimmed)
      toasts.showSuccess(`Reservation ${data.reservationId} loaded`)
    } catch (error) {
      const message = readableError(error)
      setErrorMessage(message)
      toasts.showError(message)
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
      toasts.showSuccess(data.alreadyCheckedIn ? data.message : 'Reservation check-in confirmed')
    } catch (error) {
      const message = readableError(error)
      setErrorMessage(message)
      toasts.showError(message)
    } finally {
      setLoadingConfirm(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <QrCode className="size-4" />
                </span>
                Reservation QR check-in
              </CardTitle>
              <CardDescription>Scan, review the plate, then confirm manually.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit bg-background whitespace-nowrap">
              QR-first mode
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {confirmData ? (
            <div className="space-y-5">
              <div className={`rounded-xl border px-4 py-3 ${summaryTone}`}>
                <p className="text-sm font-semibold">
                  {confirmData.alreadyCheckedIn ? 'Already checked in' : 'Check-in confirmed'}
                </p>
                <p className="mt-1 text-sm opacity-90">
                  {confirmData.alreadyCheckedIn
                    ? 'An active session already exists for this reservation.'
                    : 'Reservation is now linked to the active parking session.'}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Session code
                    </p>
                    <p className="font-mono text-2xl font-black tracking-[0.08em] text-foreground sm:text-3xl">
                      {confirmData.session.sessionCode}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      confirmData.alreadyCheckedIn
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    }
                  >
                    {confirmData.alreadyCheckedIn ? 'Already checked in' : 'Ready for next vehicle'}
                  </Badge>
                </div>

                <Separator />

                <div className="grid gap-3 md:grid-cols-2">
                  <Metric label="Plate" value={confirmData.session.licensePlate} mono strong />
                  <Metric label="Slot" value={confirmData.slot.code} />
                  <Metric label="Vehicle type" value={confirmData.session.vehicleType} />
                  <Metric label="Check-in time" value={formatDateTimeVN(confirmData.session.checkInTime)} />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={reset} className="h-11 whitespace-nowrap">
                  <RotateCcw className="size-4" />
                  Next vehicle
                </Button>
              </div>
            </div>
          ) : scanData ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Plate from DB
                  </p>
                  <p className="font-mono text-3xl font-black tracking-[0.16em] text-foreground sm:text-4xl">
                    {scanData.plateNumber}
                  </p>
                </div>
                <Badge className={`w-fit whitespace-nowrap ${badgeTone}`}>{scanData.paymentBadge}</Badge>
              </div>

              <Separator />

              <div className="grid gap-3 md:grid-cols-2">
                <Metric label="Driver name" value={scanData.driverName} />
                <Metric label="Vehicle type" value={scanData.vehicleType} />
                <Metric label="Reserved slot" value={scanData.slotLabel} />
                <Metric label="QR expiry" value={formatDateTimeVN(scanData.expiresAt)} />
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                Compare real plate before confirming. Barrier remains manual.
              </div>

              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Unable to continue</AlertTitle>
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
                <Button type="button" variant="outline" onClick={onSwitchToOcr} className="h-11 whitespace-nowrap">
                  <ArrowRightLeft className="size-4" />
                  Use OCR / Walk-in flow
                </Button>
                <Button type="button" variant="ghost" onClick={reset} className="h-11 whitespace-nowrap">
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">Ready to scan reservation QR</p>
                <p className="text-sm text-muted-foreground">
                  Start with the driver&apos;s live reservation QR. Use OCR only when QR cannot continue.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="h-11 whitespace-nowrap"
                  disabled={loadingScan}
                >
                  {loadingScan ? <Loader2 className="size-4 animate-spin" /> : <ScanLine className="size-4" />}
                  Open QR scanner
                </Button>
                <Button type="button" variant="outline" onClick={onSwitchToOcr} className="h-11 whitespace-nowrap">
                  <ArrowRightLeft className="size-4" />
                  Use OCR / Walk-in flow
                </Button>
              </div>

              <details
                open={manualFallbackOpen}
                onToggle={(event) =>
                  setManualFallbackOpen((event.currentTarget as HTMLDetailsElement).open)
                }
                className="rounded-xl border bg-muted/15 px-4 py-3 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
                  <span>Paste reservation token manually</span>
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
                    onClick={() => void submitToken(manualToken)}
                    className="h-11 whitespace-nowrap sm:min-w-[156px]"
                  >
                    {loadingScan ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                    Load reservation
                  </Button>
                </div>
              </details>

              {loadingScan ? (
                <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  Reading reservation QR and loading linked vehicle data...
                </div>
              ) : null}

              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>QR scan failed</AlertTitle>
                  <AlertDescription>
                    {errorMessage} Use OCR / walk-in flow if this reservation cannot continue by QR.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {scannerOpen ? (
        <QRScanner
          title="Scan Reservation QR"
          instructions="Scan the live reservation QR from the driver's reservation detail screen."
          manualToggleLabel="Cannot scan? Paste the reservation token manually"
          manualInputLabel="Reservation QR token"
          manualInputPlaceholder="Signed reservation token"
          onScan={(value) => {
            setScannerOpen(false)
            void submitToken(value)
          }}
          onManualInput={(value) => {
            setScannerOpen(false)
            void submitToken(value)
          }}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
    </div>
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
    <div className="rounded-xl border bg-muted/20 px-4 py-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
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

function readableError(error: unknown) {
  if (isAxiosError(error)) {
    const raw = error.response?.data?.message
    if (Array.isArray(raw)) return raw.join(', ')
    if (typeof raw === 'string') return raw
    return `Request failed (${error.response?.status ?? 'network'})`
  }

  if (error instanceof Error) return error.message
  return 'Unexpected error'
}
