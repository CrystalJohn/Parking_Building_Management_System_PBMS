import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldAlert,
} from 'lucide-react'
import { QRScanner } from '../../components/qr-scanner/QRScanner'
import { type ConfirmReservationCheckInResponse, type ReservationScanResponse, confirmReservationCheckIn, scanReservationCheckIn } from '../../lib/sessions-api'
import { type useToasts } from '../../lib/use-toasts'
import { formatDateTimeVN } from '../../lib/date-time'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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

  const badgeTone = useMemo(() => {
    if (!scanData) return 'bg-muted text-muted-foreground'
    if (scanData.paymentBadge === 'Đã thanh toán') return 'bg-emerald-100 text-emerald-800'
    if (scanData.paymentBadge === 'Auto-pay') return 'bg-sky-100 text-sky-800'
    return 'bg-amber-100 text-amber-800'
  }, [scanData])

  const reset = () => {
    setManualToken('')
    setScanData(null)
    setConfirmData(null)
    setLoadingScan(false)
    setLoadingConfirm(false)
    setScannerOpen(false)
  }

  const submitToken = async (token: string) => {
    const trimmed = token.trim()
    if (!trimmed) {
      toasts.showError('Please scan or paste a reservation QR token')
      return
    }

    setLoadingScan(true)
    try {
      const data = await scanReservationCheckIn(trimmed)
      setScanData(data)
      setConfirmData(null)
      toasts.showSuccess(`Reservation ${data.reservationId} loaded`)
    } catch (error) {
      toasts.showError(readableError(error))
    } finally {
      setLoadingScan(false)
    }
  }

  const handleConfirm = async () => {
    if (!scanData) return

    setLoadingConfirm(true)
    try {
      const data = await confirmReservationCheckIn(scanData.reservationId)
      setConfirmData(data)
      toasts.showSuccess(data.alreadyCheckedIn ? data.message : 'Reservation check-in confirmed')
    } catch (error) {
      toasts.showError(readableError(error))
    } finally {
      setLoadingConfirm(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.75fr)]">
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <QrCode className="size-4" />
            </span>
            Scan reservation QR
          </CardTitle>
          <CardDescription>
            Default gate flow for drivers with an active reservation. OCR stays available as fallback only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={() => setScannerOpen(true)} className="h-11">
              <ScanLine className="size-4" />
              Open QR scanner
            </Button>
            <Button type="button" variant="outline" onClick={onSwitchToOcr} className="h-11">
              <ArrowRightLeft className="size-4" />
              Use OCR / Walk-in flow
            </Button>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">Manual fallback</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="Paste reservation QR token"
                className="h-11 font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={loadingScan}
                onClick={() => void submitToken(manualToken)}
                className="h-11 sm:min-w-[140px]"
              >
                {loadingScan ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
                Load reservation
              </Button>
            </div>
          </div>

          {scanData ? (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Plate from DB
                    </p>
                    <p className="font-mono text-3xl font-black tracking-[0.18em] text-foreground">
                      {scanData.plateNumber}
                    </p>
                  </div>
                  <Badge className={badgeTone}>{scanData.paymentBadge}</Badge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Metric label="Vehicle type" value={scanData.vehicleType} />
                  <Metric label="Driver" value={scanData.driverName} />
                  <Metric label="Reserved slot" value={scanData.slotLabel} />
                  <Metric label="QR expires" value={formatDateTimeVN(scanData.expiresAt)} />
                </div>
              </div>

              <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                <ShieldAlert className="size-4" />
                <AlertTitle>Manual staff verification required</AlertTitle>
                <AlertDescription className="text-amber-900">
                  Compare the real vehicle plate with the DB plate above before confirming. Barrier stays manual.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" onClick={() => void handleConfirm()} disabled={loadingConfirm} className="h-11">
                  {loadingConfirm ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                  Confirm Check-in
                </Button>
                <Button type="button" variant="outline" onClick={onSwitchToOcr} className="h-11">
                  <ArrowRightLeft className="size-4" />
                  Use OCR / Walk-in flow
                </Button>
                <Button type="button" variant="ghost" onClick={reset} className="h-11">
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              </div>
            </div>
          ) : (
            <Alert className="border-dashed bg-muted/30">
              <AlertCircle className="size-4" />
              <AlertTitle>Waiting for reservation QR</AlertTitle>
              <AlertDescription>
                Use the scanner first. If QR is invalid, expired, mismatched, or unreadable, switch to OCR / walk-in flow.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle>Reservation status</CardTitle>
          <CardDescription>Staff keeps full control. Nothing opens automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {confirmData ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <CheckCircle2 className="size-4" />
              <AlertTitle>{confirmData.alreadyCheckedIn ? 'Already checked in' : 'Reservation fulfilled'}</AlertTitle>
              <AlertDescription className="text-emerald-900">
                Session {confirmData.session.sessionCode} is linked to slot {confirmData.slot.code}.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-sky-200 bg-sky-50 text-sky-950">
              <QrCode className="size-4" />
              <AlertTitle>QR-first gate mode</AlertTitle>
              <AlertDescription className="text-sky-900">
                Reservation flow skips OCR provider calls and reads trusted DB vehicle data instead.
              </AlertDescription>
            </Alert>
          )}

          {confirmData ? (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <Metric label="Session code" value={confirmData.session.sessionCode} mono />
              <Metric label="Plate" value={confirmData.session.licensePlate} mono />
              <Metric label="Slot" value={confirmData.slot.code} />
              <Metric label="Check-in time" value={formatDateTimeVN(confirmData.session.checkInTime)} />
              <Button type="button" variant="outline" onClick={reset} className="h-11 w-full">
                <RotateCcw className="size-4" />
                Next vehicle
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              Reservation scan shows the linked plate, vehicle type, slot, driver, and payment badge before any session is created.
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
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold text-foreground ${mono ? 'font-mono' : ''}`}>
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
