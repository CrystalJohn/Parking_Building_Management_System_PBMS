import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  AlertTriangle,
  Building2,
  Download,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getReservationCheckInQr, type Reservation, type ReservationCheckInQr } from '@/lib/driver-api'
import { formatDateTimeVN } from '@/lib/date-time'

type QrState = { data: ReservationCheckInQr; pngDataUrl: string } | null

export function ReservationCheckInQr({
  reservation,
  onClose,
}: {
  reservation: Reservation
  onClose?: () => void
}) {
  const [qr, setQr] = useState<QrState>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQr = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getReservationCheckInQr(reservation.id)
      const pngDataUrl = await QRCode.toDataURL(data.token, {
        width: 320,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQr({ data, pngDataUrl })
    } catch {
      setError('Unable to load check-in pass. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [reservation.id])

  useEffect(() => {
    void fetchQr()
  }, [fetchQr])

  const rawPlate = reservation.licensePlate ?? reservation.vehicle?.plateNumber ?? ''
  const formattedPlate = reservation.plateDisplay ?? rawPlate
  const reservationId = `RSV-2026-${reservation.id.slice(-5).toUpperCase()}`

  const handleDownload = () => {
    if (!qr?.pngDataUrl) return
    const a = document.createElement('a')
    a.href = qr.pngDataUrl
    a.download = `Check-in-Pass-${rawPlate}.png`
    a.click()
  }

  return (
    <div className="w-full rounded-2xl bg-[#0B1220] p-6 font-sans text-slate-100 shadow-2xl">
      {/* Header */}
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Shield className="size-4" />
          </span>
          <h2 className="text-xl font-bold tracking-tight text-white">Check-in Pass</h2>
        </div>
        <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
          Present this QR code at the entrance gate if license plate recognition is unavailable.
        </p>
      </div>

      {/* Vehicle Information Card (Apple Wallet / Tesla Style) */}
      <div className="mt-5 rounded-xl border border-white/10 bg-[#111827] p-4 shadow-lg">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle Plate</span>
            <p className="font-mono text-xl font-extrabold tracking-wider text-white">{formattedPlate}</p>
          </div>
          <Badge className="border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
            Reserved
          </Badge>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-left">
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">Reservation ID</span>
            <span className="mt-0.5 block font-mono text-xs font-semibold text-slate-200">{reservationId}</span>
          </div>
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">Building</span>
            <span className="mt-0.5 flex items-center gap-1 font-mono text-xs font-semibold text-slate-200">
              <Building2 className="size-3 text-slate-400" />
              PBMS Tower
            </span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">Reservation Time</span>
            <span className="mt-0.5 block text-xs font-semibold text-slate-200">
              {formatDateTimeVN(reservation.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* QR Section */}
      <div className="mt-5 flex flex-col items-center justify-center">
        {/* Large White QR Background Card with 24px padding & rounded 16px */}
        <div className="relative flex min-h-[270px] w-full max-w-[270px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-6 shadow-2xl">
          {loading && !qr ? (
            <Loader2 className="size-10 animate-spin text-[#0B1220]" aria-label="Loading check-in pass" />
          ) : null}

          {qr ? (
            <div className="relative flex items-center justify-center">
              <img
                src={qr.pngDataUrl}
                alt={`Check-in QR for ${formattedPlate}`}
                className="size-56 max-w-full object-contain"
              />
            </div>
          ) : null}

          {!loading && !qr ? (
            <div className="space-y-3 text-center">
              <AlertTriangle className="mx-auto size-8 text-amber-500" />
              <p className="text-sm font-medium text-slate-800">Pass unavailable</p>
              <Button type="button" variant="outline" className="min-h-10 border-slate-300 text-xs text-slate-800" onClick={() => void fetchQr()}>
                <RefreshCw className="mr-1.5 size-3.5" />
                Retry
              </Button>
            </div>
          ) : null}
        </div>

        {/* Security Label */}
        <p className="mt-3.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          Secure QR • Valid for Gate Entrance
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-center text-xs font-medium text-rose-400">
          {error}
        </p>
      ) : null}

      {/* Footer Actions */}
      <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1 border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
          onClick={handleDownload}
          disabled={!qr}
        >
          <Download className="mr-2 size-4" />
          Download Pass
        </Button>
        <Button
          type="button"
          className="min-h-11 flex-1 bg-emerald-600 font-semibold text-white hover:bg-emerald-500"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    </div>
  )
}
