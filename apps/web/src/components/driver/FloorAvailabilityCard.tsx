import { CheckCircle2, CircleAlert, Layers3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AvailabilityItem, VehicleType } from '@/lib/driver-api'

export function FloorAvailabilityCard({ floorName, items }: { floorName: string; items: AvailabilityItem[] }) {
  return (
    <Card className="overflow-hidden shadow-sm">
      <CardHeader className="bg-muted/30 pb-4 pt-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Layers3 className="size-4 text-primary" />
          {floorName}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        {(['car', 'motorbike'] as VehicleType[]).map((type) => {
          const item = items.find((entry) => entry.vehicleType === type)
          if (!item) return null

          const percentage = item.total ? Math.round((item.available / item.total) * 100) : 0
          const label = item.available === 0 ? 'Full' : percentage < 35 ? 'Limited' : 'Available'
          const Icon = label === 'Full' || label === 'Limited' ? CircleAlert : CheckCircle2
          
          const colorClass = label === 'Full' ? 'text-rose-500' : label === 'Limited' ? 'text-amber-500' : 'text-emerald-500'
          const bgClass = label === 'Full' ? 'bg-rose-500' : label === 'Limited' ? 'bg-amber-500' : 'bg-emerald-500'

          return (
            <div key={type} className="flex flex-col justify-between rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold capitalize text-foreground">{type}</p>
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  label === 'Full' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                  label === 'Limited' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                }`}>
                  <Icon className="size-3" />
                  {label}
                </span>
              </div>
              
              <div className="mt-4 flex items-end justify-between">
                <div className="space-y-1">
                  <p className="text-2xl font-bold tracking-tight tabular-nums">
                    {item.available}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">/ {item.total}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Available spots</p>
                </div>
                <span className={`text-sm font-bold ${colorClass}`}>{percentage}%</span>
              </div>
              
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all ${bgClass}`} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
