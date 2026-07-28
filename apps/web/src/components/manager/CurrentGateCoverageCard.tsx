import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, CircleDot, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CurrentGateCoverage, GateCoverageStatus } from '@/lib/gate-lanes-api'
import { formatVehicleType } from '@/lib/plate-format'

const statusText: Record<GateCoverageStatus, string> = {
  fixed_covered: 'Covered',
  fixed_unassigned: 'Unassigned',
  scheduled_unclaimed: 'Unclaimed',
  on_duty: 'On duty',
  substitute_on_duty: 'Substitute on duty',
  unassigned_on_duty: 'Unassigned on duty',
  inactive: 'Inactive',
}

export function CurrentGateCoverageCard({ coverage, error }: { coverage: CurrentGateCoverage | null; error: string | null }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">Current gate coverage</CardTitle>
            <Badge variant="secondary">Fixed assignment</Badge>
          </div>
          <CardDescription className="mt-1">
            {coverage ? `${coverage.currentShift.label} · ${coverage.currentShift.startsAt}–${coverage.currentShift.endsAt} · ${coverage.timezone}` : 'Live lane eligibility overview'}
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/manager/config"><Settings2 className="mr-1.5 size-4" />Gate lanes</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
        {!error && coverage?.lanes.length === 0 ? <p className="text-sm text-muted-foreground">No gate lanes configured.</p> : null}
        {!error && coverage ? (
          <div className="grid gap-3 md:grid-cols-2">
            {(['car', 'motorbike'] as const).map((vehicleType) => {
              const lanes = coverage.lanes.filter((item) => item.lane.vehicleType === vehicleType)
              return (
                <div key={vehicleType} className="space-y-2 rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs font-bold tracking-wider text-muted-foreground">{formatVehicleType(vehicleType)}</p>
                  {lanes.length === 0 ? <p className="text-sm text-muted-foreground">No lanes</p> : lanes.map((item) => {
                    const warning = item.status !== 'fixed_covered'
                    const formattedName = item.lane.name.replace(/\b(car|motorbike|motobike)\b/gi, (m) => formatVehicleType(m))
                    return <div key={item.lane.id} className="flex items-center justify-between gap-3 rounded-lg bg-background p-2.5">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold">{formattedName} <span className="font-mono text-xs text-muted-foreground">({item.lane.code})</span></p><p className="text-xs text-muted-foreground">{item.eligibleStaff.length ? item.eligibleStaff.map((staff) => staff.fullName || staff.phone).join(', ') : 'No active eligible staff'}</p></div>
                      <Badge variant={warning ? 'outline' : 'secondary'} className={warning ? 'shrink-0 border-amber-300 text-amber-700 dark:text-amber-300' : 'shrink-0'}>{warning ? <AlertTriangle className="mr-1 size-3" /> : <CheckCircle2 className="mr-1 size-3" />}{statusText[item.status]}</Badge>
                    </div>
                  })}
                </div>
              )
            })}
          </div>
        ) : null}
        {coverage ? <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><CircleDot className="size-3" />{coverage.summary.covered}/{coverage.summary.total} lanes covered</p> : null}
      </CardContent>
    </Card>
  )
}
