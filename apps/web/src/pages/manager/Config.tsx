import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { Loader2, Settings2, Home } from 'lucide-react'
import api from '../../lib/api'
import { useToasts } from '../../lib/use-toasts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PricingConfig {
  id: number
  vehicleType: 'car' | 'motorbike'
  hourlyRate: number
  overtimePenalty: number
  lostTicketPenalty: number
  overtimeThresholdHours: number
}

interface BuildingFloor {
  id: number
  floorNumber: number
  name: string
  zoneA: { total: number; occupied: number; maintenance: number }
  zoneB: { total: number; occupied: number; maintenance: number }
}

interface BuildingConfig {
  floors: BuildingFloor[]
  summary: {
    totalFloors: number
    slotsPerFloorZoneA: number
    slotsPerFloorZoneB: number
  }
}

/**
 * 29.4: Manager Config page — pricing + building config.
 * Req 10.1, 10.2, 10.4
 */
export default function Config() {
  const toasts = useToasts()

  return (
    <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Settings2 className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">System configuration</h1>
            <p className="text-sm text-muted-foreground">Manage pricing rates and building layout parameters</p>
          </div>
        </header>

        <PricingSection toasts={toasts} />
        <BuildingSection toasts={toasts} />
      </div>
  )
}

// ─── Pricing Section ─────────────────────────────────────────────────────────

function PricingSection({ toasts }: { toasts: ReturnType<typeof useToasts> }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, PricingConfig>>({})

  useEffect(() => {
    loadPricing()
  }, [])

  const loadPricing = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/config/pricing')
      const map: Record<string, PricingConfig> = {}
      for (const c of data) {
        map[c.vehicleType.toLowerCase()] = { ...c }
      }
      setEditValues(map)
    } catch {
      toasts.showError('Unable to load pricing configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (vehicleType: 'car' | 'motorbike') => {
    const values = editValues[vehicleType]
    if (!values) return

    setSaving(true)
    try {
      await api.put('/config/pricing', {
        vehicleType,
        hourlyRate: values.hourlyRate,
        overtimePenalty: values.overtimePenalty,
        lostTicketPenalty: values.lostTicketPenalty,
        overtimeThresholdHours: values.overtimeThresholdHours,
      })
      toasts.showSuccess(`Pricing updated for ${vehicleType === 'car' ? 'car' : 'motorbike'}`)
      await loadPricing()
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message
        toasts.showError(typeof msg === 'string' ? msg : 'Update error')
      }
    } finally {
      setSaving(false)
    }
  }

  const updateField = (
    vehicleType: string,
    field: keyof PricingConfig,
    value: number,
  ) => {
    setEditValues((prev) => ({
      ...prev,
      [vehicleType]: { ...prev[vehicleType], [field]: value },
    }))
  }

  if (loading) {
    return (
      <Card className="border-primary/10">
        <CardContent className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-primary/15 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="text-lg">Pricing Matrix</CardTitle>
        <CardDescription>Configure base rates and penalty rates per vehicle type</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid md:grid-cols-2 gap-6">
          {(['car', 'motorbike'] as const).map((type) => {
            const values = editValues[type]
            if (!values) return null
            const label = type === 'car' ? 'Car (Zone A)' : 'Motorbike (Zone B)'

            return (
              <div key={type} className="space-y-4 rounded-xl border bg-muted/10 p-5">
                <h3 className="font-semibold text-foreground text-sm tracking-wide border-b pb-2">{label}</h3>

                <div className="space-y-1.5">
                  <Label htmlFor={`${type}-hourly`} className="text-xs text-muted-foreground">Hourly rate (VND)</Label>
                  <Input
                    id={`${type}-hourly`}
                    type="number"
                    value={values.hourlyRate}
                    onChange={(e) => updateField(type, 'hourlyRate', Number(e.target.value))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${type}-overtime`} className="text-xs text-muted-foreground">Overtime surcharge (VND)</Label>
                  <Input
                    id={`${type}-overtime`}
                    type="number"
                    value={values.overtimePenalty}
                    onChange={(e) => updateField(type, 'overtimePenalty', Number(e.target.value))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${type}-lost`} className="text-xs text-muted-foreground">Lost ticket surcharge (VND)</Label>
                  <Input
                    id={`${type}-lost`}
                    type="number"
                    value={values.lostTicketPenalty}
                    onChange={(e) => updateField(type, 'lostTicketPenalty', Number(e.target.value))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${type}-threshold`} className="text-xs text-muted-foreground">Overtime threshold (hours)</Label>
                  <Input
                    id={`${type}-threshold`}
                    type="number"
                    value={values.overtimeThresholdHours}
                    onChange={(e) => updateField(type, 'overtimeThresholdHours', Number(e.target.value))}
                  />
                </div>

                <Button
                  onClick={() => handleSave(type)}
                  className="w-full"
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Configuration
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Building Section ────────────────────────────────────────────────────────

function BuildingSection({ toasts }: { toasts: ReturnType<typeof useToasts> }) {
  const [building, setBuilding] = useState<BuildingConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBuilding()
  }, [])

  const loadBuilding = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/config/building')
      setBuilding(data)
    } catch {
      toasts.showError('Unable to load building configuration')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className="border-primary/10">
        <CardContent className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  if (!building) return null

  return (
    <Card className="border-primary/15 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="text-lg">Building Layout Structure</CardTitle>
        <CardDescription>View physical parking zones, floors, and slot distributions</CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-muted/30 border rounded-xl p-3">
            <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">Floors</p>
            <p className="font-extrabold text-2xl mt-1 text-foreground">{building.summary.totalFloors}</p>
          </div>
          <div className="bg-muted/30 border rounded-xl p-3">
            <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">Car slots/floor</p>
            <p className="font-extrabold text-2xl mt-1 text-foreground">{building.summary.slotsPerFloorZoneA}</p>
          </div>
          <div className="bg-muted/30 border rounded-xl p-3">
            <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider">Motorbike slots/floor</p>
            <p className="font-extrabold text-2xl mt-1 text-foreground">{building.summary.slotsPerFloorZoneB}</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          {building.floors.map((floor) => (
            <div key={floor.id} className="border border-border bg-card/45 rounded-xl p-4 space-y-3">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Home className="size-4 text-primary" />
                {floor.name} <span className="text-xs font-normal text-muted-foreground">(Floor {floor.floorNumber})</span>
              </h3>
              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-background/40 border rounded-lg p-3">
                  <p className="font-semibold text-primary mb-1.5 uppercase tracking-wider text-[10px]">Zone A — Car</p>
                  <p className="text-foreground">
                    Total: <span className="font-semibold">{floor.zoneA.total}</span> | In use: <span className="font-semibold">{floor.zoneA.occupied}</span> | Maintenance: <span className="font-semibold">{floor.zoneA.maintenance}</span>
                  </p>
                </div>
                <div className="bg-background/40 border rounded-lg p-3">
                  <p className="font-semibold text-primary mb-1.5 uppercase tracking-wider text-[10px]">Zone B — Motorbike</p>
                  <p className="text-foreground">
                    Total: <span className="font-semibold">{floor.zoneB.total}</span> | In use: <span className="font-semibold">{floor.zoneB.occupied}</span> | Maintenance: <span className="font-semibold">{floor.zoneB.maintenance}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground italic mt-2 text-center">
          To set specific slots to maintenance status, use the interactive Dashboard view or PATCH /slots/:id/status.
        </p>
      </CardContent>
    </Card>
  )
}
