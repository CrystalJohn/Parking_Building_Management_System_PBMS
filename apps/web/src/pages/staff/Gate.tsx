import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useToasts } from '../../lib/use-toasts'
import { getCurrentGateLane, type CurrentGateAssignment } from '../../lib/gate-lanes-api'
import { formatVehicleType } from '../../lib/plate-format'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { GateFlow } from './components'

export function GatePage() {
  const toasts = useToasts()
  const [searchParams, setSearchParams] = useSearchParams()
  const [laneAssignment, setLaneAssignment] = useState<CurrentGateAssignment | null>(null)
  const [laneLoading, setLaneLoading] = useState(true)

  // Xử lý deep-link cũ: ?tab=check-in hoặc ?tab=check-out -> redirect về URL sạch
  useEffect(() => {
    if (searchParams.has('tab')) {
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('tab')
      setSearchParams(newParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    let active = true
    setLaneLoading(true)
    void getCurrentGateLane()
      .then((assignment) => {
        if (active) setLaneAssignment(assignment)
      })
      .catch(() => {
        if (active) setLaneAssignment(null)
      })
      .finally(() => {
        if (active) setLaneLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const lane = laneAssignment?.gateLane
  const vehicleLabel = lane ? formatVehicleType(lane.vehicleType) : ''
  const laneLabel = lane
    ? lane.name.toLowerCase().includes(lane.vehicleType.toLowerCase()) ||
      lane.name.toLowerCase().includes('motobike')
      ? lane.name.replace(/\b(car|motorbike|motobike)\b/gi, vehicleLabel)
      : `${lane.name} · ${vehicleLabel}`
    : null

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Gate Operations
            </h1>
            {laneLabel ? <Badge variant="secondary">{laneLabel}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Quét QR hoặc nhập biển số để check-in / check-out
          </p>
        </div>
      </header>

      {/* Main Content */}
      {laneLoading ? (
        <Card className="flex min-h-48 items-center justify-center p-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </Card>
      ) : !lane || !lane.isActive ? (
        <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle>Gate lane assignment required</CardTitle>
            <p className="text-sm text-muted-foreground">
              Contact a manager to receive an active Car or Motorbike lane assignment before using this gate.
            </p>
          </CardHeader>
        </Card>
      ) : (
        <GateFlow
          toasts={toasts}
          laneVehicleType={lane.vehicleType}
        />
      )}
    </div>
  )
}

export default GatePage
