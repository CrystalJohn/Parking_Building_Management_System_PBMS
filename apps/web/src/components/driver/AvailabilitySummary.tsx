import { Bike, CarFront } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { AvailabilityItem, VehicleType } from '@/lib/driver-api'

export function AvailabilitySummary({ items, vehicleType, rate }: { items: AvailabilityItem[]; vehicleType: VehicleType; rate: number }) {
  const available = items.reduce((sum, item) => sum + item.available, 0)
  const total = items.reduce((sum, item) => sum + item.total, 0)
  const percentage = total > 0 ? Math.round((available / total) * 100) : 0

  return (
    <Card className="overflow-hidden shadow-sm transition-all hover:shadow-md">
      <CardContent className="flex items-center gap-4 p-5 sm:p-6">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {vehicleType === 'car' ? <CarFront className="size-6" /> : <Bike className="size-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">
            {vehicleType === 'car' ? 'Car' : 'Motorbike'}
          </h3>
          <p className="text-xs font-medium text-muted-foreground">
            {new Intl.NumberFormat('vi-VN').format(rate)} VND / hour
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tracking-tight tabular-nums">
            <span className={available > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
              {available}
            </span>
            <span className="text-sm font-normal text-muted-foreground"> / {total}</span>
          </p>
          <p className="text-[11px] font-medium text-muted-foreground">
            {percentage}% available
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
