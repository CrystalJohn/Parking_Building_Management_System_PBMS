import { Link } from 'react-router-dom'
import { CalendarClock, CarFront, MapPin, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Reservation } from '@/lib/driver-api'
import { formatDateTimeVN } from '@/lib/date-time'
import { ReservationCheckInQr } from './ReservationCheckInQr'

export function ActiveReservationCard({ reservation, onCancel }: { reservation: Reservation; onCancel: (id: string) => void }) {
  const plate = reservation.licensePlate ?? reservation.vehicle?.plateNumber ?? 'Linked vehicle'
  return (
    <Card className="overflow-hidden border-sky-200 shadow-sm dark:border-sky-400/20">
      <CardHeader className="bg-sky-50/70 pb-4 dark:bg-sky-500/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge className="mb-2 bg-sky-600 text-white hover:bg-sky-600">Active reservation</Badge>
            <CardTitle className="text-xl">Your active reservation</CardTitle>
            <CardDescription className="mt-1">Ready for check-in before the reservation expires.</CardDescription>
          </div>
          <CarFront className="size-7 shrink-0 text-sky-700 dark:text-sky-200" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Vehicle" value={plate} mono />
          <Info label="Type" value={reservation.vehicleType === 'car' ? 'Ô tô (Car)' : 'Xe máy (Motorbike)'} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="size-4" />Tòa nhà PBMS · {reservation.vehicleType === 'car' ? 'Khu vực Ô tô' : 'Khu vực Xe máy'}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock className="size-4" />Hạn chót check-in: {formatDateTimeVN(reservation.expiresAt)}</div>
        <ReservationCheckInQr reservation={reservation} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild className="min-h-11"><Link to="/driver/reservations">Manage reservation</Link></Button>
          <Button type="button" variant="outline" className="min-h-11 text-rose-700 hover:text-rose-800 dark:text-rose-200" onClick={() => onCancel(reservation.id)}><X className="mr-2 size-4" />Cancel reservation</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{value}</p></div>
}
