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
  const plannedArrivalStr = reservation.plannedArrivalAt
    ? formatDateTimeVN(reservation.plannedArrivalAt)
    : 'Not Specified'

  const handleDownload = () => {
    if (!qr?.pngDataUrl) return
    const a = document.createElement('a')
    a.href = qr.pngDataUrl
    a.download = `Check-in-Pass-${rawPlate}.png`
    a.click()
  }

  return (
    <div className="w-full max-w-xl mx-auto rounded-2xl bg-[#0B1220] p-4 sm:p-5 font-sans text-slate-100 shadow-2xl">
      {/* Header */}
      <div className="border-b border-white/10 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <Shield className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white leading-none">Gate Entrance Pass</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Present QR code or license plate at gate scanner
            </p>
          </div>
        </div>
        <Badge className="border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
          RESERVED
        </Badge>
      </div>

      {/* Main Content: 2-Column Responsive Layout */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
        {/* Left Column: Vehicle & Time Details */}
        <div className="sm:col-span-7 space-y-3">
          <div className="rounded-xl border border-white/10 bg-[#111827] p-3.5 space-y-2.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle License Plate</span>
              <p className="font-mono text-2xl font-black tracking-wider text-white leading-tight">{formattedPlate}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left border-t border-white/10 pt-2.5">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">Pass ID</span>
                <span className="block font-mono text-xs font-bold text-slate-200">{reservationId}</span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">Building</span>
                <span className="flex items-center gap-1 font-mono text-xs font-bold text-slate-200">
                  <Building2 className="size-3 text-slate-400" />
                  PBMS Tower
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left border-t border-white/10 pt-2.5">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400">Planned Arrival</span>
                <span className="block font-mono text-xs font-extrabold text-emerald-300">
                  {plannedArrivalStr}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">Reserved At</span>
                <span className="block text-[11px] font-semibold text-slate-300">
                  {formatDateTimeVN(reservation.createdAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 leading-snug">
            ⚡ <strong>Grace Expiry Rule:</strong> This pass remains valid up to <strong>15 minutes</strong> past your planned arrival ({plannedArrivalStr}). Arriving &gt;15m late will automatically cancel the reservation.
          </div>
        </div>

        {/* Right Column: QR Code */}
        <div className="sm:col-span-5 flex flex-col items-center justify-center">
          <div className="relative flex size-44 sm:size-48 flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xl">
            {loading && !qr ? (
              <Loader2 className="size-8 animate-spin text-[#0B1220]" aria-label="Loading check-in pass" />
            ) : null}

            {qr ? (
              <img
                src={qr.pngDataUrl}
                alt={`Check-in QR for ${formattedPlate}`}
                className="size-full object-contain"
              />
            ) : null}

            {!loading && !qr ? (
              <div className="space-y-2 text-center">
                <AlertTriangle className="mx-auto size-6 text-amber-500" />
                <p className="text-xs font-medium text-slate-800">Pass unavailable</p>
                <Button type="button" variant="outline" className="min-h-8 border-slate-300 text-[11px] text-slate-800 px-2" onClick={() => void fetchQr()}>
                  <RefreshCw className="mr-1 size-3" /> Retry
                </Button>
              </div>
            ) : null}
          </div>

          <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-400 text-center">
            <ShieldCheck className="size-3.5 text-emerald-400 shrink-0" />
            Secure Gate QR Pass
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-center text-xs font-medium text-rose-400">
          {error}
        </p>
      ) : null}

      {/* Footer Actions */}
      <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-10 flex-1 border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white text-xs font-semibold"
          onClick={handleDownload}
          disabled={!qr}
        >
          <Download className="mr-1.5 size-3.5" />
          Download Pass
        </Button>
        <Button
          type="button"
          className="min-h-10 flex-1 bg-emerald-600 font-bold text-white hover:bg-emerald-500 text-xs"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    </div>
  )
}
