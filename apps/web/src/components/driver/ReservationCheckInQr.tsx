import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getReservationCheckInQr, type Reservation, type ReservationCheckInQr } from '@/lib/driver-api'

type QrState = { data: ReservationCheckInQr; image: string } | null

export function ReservationCheckInQr({ reservation }: { reservation: Reservation }) {
  const [qr, setQr] = useState<QrState>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getReservationCheckInQr(reservation.id)
      const image = await QRCode.toDataURL(data.token, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#102a43', light: '#ffffff' },
      })
      setQr({ data, image })
    } catch {
      setError('Unable to refresh the check-in QR. Retry before showing it at the gate.')
      setQr((current) => {
        if (current && new Date(current.data.expiresAt).getTime() > Date.now()) return current
        return null
      })
    } finally {
      setLoading(false)
    }
  }, [reservation.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!qr) return
    const delay = Math.max(1000, qr.data.refreshAfterMs)
    const timer = window.setTimeout(() => void refresh(), delay)
    return () => window.clearTimeout(timer)
  }, [qr, refresh])

  const expiresAt = qr ? new Date(qr.data.expiresAt).getTime() : 0
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const isExpired = Boolean(qr) && remaining <= 0

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-400/20 dark:bg-sky-500/10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-sky-950 dark:text-sky-100">Check-in QR</p>
          <p className="text-xs text-sky-800/75 dark:text-sky-100/70">Show this code to gate staff</p>
        </div>
        {qr && !isExpired ? <span className="font-mono text-xs font-semibold text-sky-800 dark:text-sky-100">Refreshes in {remaining}s</span> : null}
      </div>
      <div className="flex min-h-[260px] items-center justify-center rounded-xl bg-white p-3">
        {loading && !qr ? <Loader2 className="size-7 animate-spin text-sky-600" aria-label="Loading check-in QR" /> : null}
        {qr && !isExpired ? <img src={qr.image} alt={`Check-in QR for ${qr.data.vehicle.plateNumber}`} className="size-56 max-w-full" /> : null}
        {!loading && (!qr || isExpired) ? <div className="space-y-3 text-center"><AlertTriangle className="mx-auto size-7 text-amber-600" /><p className="text-sm font-medium text-slate-700">QR expired or unavailable</p><Button type="button" variant="outline" className="min-h-11" onClick={() => void refresh()}><RefreshCw className="mr-2 size-4" />Retry</Button></div> : null}
      </div>
      {error ? <p role="alert" className="mt-3 text-xs font-medium text-rose-700 dark:text-rose-200">{error}</p> : null}
    </div>
  )
}
