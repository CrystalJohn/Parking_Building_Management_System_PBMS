import { useEffect, useState } from 'react'
import { ArrowRight, Building2, Car, Clock, MapPin, QrCode, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  getMyActiveSessions,
  getSessionQr,
  type ActiveSession,
} from '../../lib/driver-api'
import { formatDateTimeVN } from '../../lib/date-time'
import { formatVehicleType } from '../../lib/plate-format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const formatDateTime = formatDateTimeVN

export default function MySession() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadSessions()
  }, [])

  const loadSessions = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getMyActiveSessions()
      setSessions(data)

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
      setError('Unable to load session information.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-slate-50/70 dark:bg-slate-950/40">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-5 sm:px-6 sm:py-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <QrCode className="size-4" />
              Digital Pass
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Digital Exit Pass</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Show your digital exit pass QR code to staff or scanner when exiting the building.
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

                      <div className="col-span-2 border-t pt-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3.5" />
                          <span>Check-in Time</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {formatDateTime(session.checkInTime)}
                        </p>
                      </div>
                    </div>
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
