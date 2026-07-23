import { CarFront, CircleDot } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { AvailabilityItem, VehicleType } from '@/lib/driver-api'

export function AvailabilitySummary({ items, vehicleType, rate }: { items: AvailabilityItem[]; vehicleType: VehicleType; rate: number }) {
  const available = items.reduce((sum, item) => sum + item.available, 0)
  const total = items.reduce((sum, item) => sum + item.total, 0)
  return <Card className="shadow-sm"><CardContent className="flex items-center gap-3 p-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{vehicleType === 'car' ? <CarFront className="size-5" /> : <CircleDot className="size-5" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{vehicleType === 'car' ? 'Car' : 'Motorbike'}</p><p className="text-xs text-muted-foreground">{new Intl.NumberFormat('vi-VN').format(rate)} VND / hour</p></div><p className="font-mono text-lg font-bold tabular-nums"><span className={available > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>{available}</span><span className="text-muted-foreground">/{total}</span></p></CardContent></Card>
}
