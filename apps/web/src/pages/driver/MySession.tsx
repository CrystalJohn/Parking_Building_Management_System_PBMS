import { useEffect, useState } from 'react'
import { ArrowRight, Building2, Car, Clock, MapPin, QrCode, RefreshCw, ShieldCheck, Tag } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  getMyActiveSessions,
  getPricing,
  getSessionQr,
  type ActiveSession,
  type PricingInfo,
} from '../../lib/driver-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatVehicleType } from '../../lib/plate-format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'



function SessionLiveSummary({ session, pricing }: { session: ActiveSession; pricing: PricingInfo[] }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const checkIn = new Date(session.checkInTime).getTime()
  const durationMs = Math.max(0, now - checkIn)
  const totalSec = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60

  const durationHours = durationMs / (1000 * 60 * 60)
  const roundedHours = Math.max(1, Math.ceil(durationHours))

  const isCar = session.vehicleType === 'car'
  const pricingForType = pricing.find((p) => p.vehicleType === session.vehicleType)
  const defaultBaseRate = isCar ? 20000 : 10000
  const discountPct = pricingForType?.reservationDiscountPercent ?? 20

  const hasReservation = Boolean(session.reservationId || session.reservation)
  const lockedDeposit = session.reservation?.depositAmount ?? 0

  // Locked rate from reservation creation time, or fallback to current pricing config
  const discountedRate = hasReservation && lockedDeposit > 0
    ? lockedDeposit
    : Math.round((pricingForType?.hourlyRate ?? defaultBaseRate) * (1 - discountPct / 100))
  
  const baseRate = hasReservation && lockedDeposit > 0
    ? Math.round(lockedDeposit / (1 - discountPct / 100))
    : (pricingForType?.hourlyRate ?? defaultBaseRate)

  // Calculate estimated fee
  let estimatedFee = 0
  let billableHours = roundedHours

  if (hasReservation) {
    // 1st hour covered by deposit paid online!
    billableHours = Math.max(0, roundedHours - 1)
    estimatedFee = billableHours * discountedRate
  } else {
    // Walk-in: 10 mins grace is 0, otherwise full rounded hours * baseRate
    const durationMins = Math.floor(durationMs / 60000)
    if (durationMins <= 10) {
      estimatedFee = 0
    } else {
      estimatedFee = roundedHours * baseRate
    }
  }

  const formattedTimer = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return (
    <div className="space-y-4">
      {/* Dynamic Session Duration Counter */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 text-emerald-950 dark:text-emerald-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <Clock className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Actual Parking Duration:</span>
          </div>
          <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-xs animate-pulse">
            ● Active Session
          </Badge>
        </div>
        <div className="flex items-baseline justify-between border-t border-emerald-500/20 pt-2">
          <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Live Parking Timer:</span>
          <span className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formattedTimer}
          </span>
        </div>
        <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
          Checked-in at: <strong className="font-mono">{formatDateTimeVN(session.checkInTime)}</strong> ({roundedHours}h parked)
        </p>
      </div>

      {/* Estimated Fee Box */}
      <div className="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Tag className="size-3.5" /> Estimated Fee Summary
          </span>
          {hasReservation ? (
            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
              Pre-booked Locked Rate (-{discountPct}%)
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-semibold">Standard Walk-in Tariff</Badge>
          )}
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Applied Hourly Rate:</span>
            <span className="font-mono font-bold text-foreground">
              {hasReservation ? `${discountedRate.toLocaleString('vi-VN')}đ/h` : `${baseRate.toLocaleString('vi-VN')}đ/h`}
              {hasReservation ? <span className="ml-1.5 text-[11px] text-muted-foreground line-through">{baseRate.toLocaleString('vi-VN')}đ</span> : null}
            </span>
          </div>

          {hasReservation ? (
            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="flex items-center gap-1">
                <ShieldCheck className="size-3.5" /> Online Deposit Paid (1st Hour Waived):
              </span>
              <span className="font-mono font-extrabold">-{discountedRate.toLocaleString('vi-VN')}đ</span>
            </div>
          ) : null}

          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Billable Hours at Exit Gate:</span>
            <span className="font-mono font-bold text-foreground">
              {hasReservation ? `${billableHours}h (From Hour 2 onwards)` : `${roundedHours}h`}
            </span>
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t pt-2.5">
          <span className="text-xs font-bold text-foreground">Estimated Payable at Exit Gate:</span>
          <span className="font-mono text-xl font-black text-primary">
            {estimatedFee.toLocaleString('vi-VN')} VNĐ
          </span>
        </div>
      </div>
    </div>
  )
}

export default function MySession() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [pricing, setPricing] = useState<PricingInfo[]>([])
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [data, pricingData] = await Promise.all([
        getMyActiveSessions(),
        getPricing().catch(() => []),
      ])
      setSessions(data)
      setPricing(pricingData)

      const qrs: Record<string, string> = {}
      for (const session of data) {
        if (session.qrCode) {
          qrs[session.id] = session.qrCode
        } else {
          try {
            const { qrCode } = await getSessionQr(session.id)
            qrs[session.id] = qrCode
          } catch {
            // QR generation failed — skip
          }
        }
      }
      setQrCodes(qrs)
    } catch {
      if (!silent) setError('Unable to load session information.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void loadSessions(false)

    // Tự động kiểm tra & cập nhật Real-time 3s/lần khi staff checkout xong ở cổng ra
    const timer = window.setInterval(() => {
      void loadSessions(true)
    }, 3000)

    const onFocus = () => {
      void loadSessions(true)
    }
    window.addEventListener('focus', onFocus)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-slate-50/70 dark:bg-slate-950/40">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-5 sm:px-6 sm:py-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <QrCode className="size-4" />
              Digital Pass
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Digital Exit Pass &amp; Session</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Show your digital exit pass QR code at the exit gate for checkout.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => void loadSessions()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh session
          </Button>
        </header>

        {error ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
            {error}{' '}
            <button
              type="button"
              className="ml-2 font-semibold underline underline-offset-4"
              onClick={() => void loadSessions()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4" aria-label="Loading session QR">
            <div className="h-64 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="rounded-2xl border bg-background p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <QrCode className="size-7" />
            </div>
            <h2 className="mt-4 text-xl font-bold tracking-tight">No Active Parking Session</h2>
            <p className="mt-2 mx-auto max-w-md text-sm text-muted-foreground">
              You are currently not parked in the building. Once you check in at the entrance gate, your exit QR code will automatically appear here.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="rounded-full shadow-sm">
                <Link to="/driver/reservations">
                  Reserve a spot <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full">
                <Link to="/driver/home">Check availability</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {sessions.map((session) => (
              <Card key={session.id} className="overflow-hidden shadow-sm">
                <CardHeader className="bg-muted/30 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-semibold">
                        <Car className="size-3.5" />
                        {formatVehicleType(session.vehicleType)}
                      </Badge>
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                        Active Session
                      </Badge>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Session #{session.id.slice(-6)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-6 p-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">License Plate</p>
                      <p className="mt-1 font-mono text-3xl font-black tracking-wider text-foreground">
                        {session.plateDisplay ?? session.licensePlate}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/20 p-4">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="size-3.5" />
                          <span>Slot Code</span>
                        </div>
                        <p className="mt-1 font-mono text-base font-bold text-foreground">
                          {session.slot.code}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="size-3.5" />
                          <span>Floor</span>
                        </div>
                        <p className="mt-1 text-base font-bold text-foreground">
                          {session.slot.floor.name}
                        </p>
                      </div>
                    </div>

                    {/* Live Timer & Estimated Fee Summary */}
                    <SessionLiveSummary session={session} pricing={pricing} />
                  </div>

                  <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-6 text-center shadow-xs">
                    {qrCodes[session.id] ? (
                      <>
                        <p className="text-xs font-bold uppercase tracking-wider text-primary">EXIT GATE PASS</p>
                        <div className="mt-3 rounded-2xl border-2 border-primary/20 bg-white p-3 shadow-inner">
                          <img
                            src={qrCodes[session.id]}
                            alt={`QR for ${session.licensePlate}`}
                            className="size-52 object-contain"
                          />
                        </div>
                        <p className="mt-3 text-xs font-medium text-muted-foreground">
                          Scan this QR code at the exit gate for checkout &amp; payment.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No QR code generated for this session.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
