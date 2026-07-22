import { useEffect, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import {
  Bike,
  Building2,
  Car,
  ChevronDown,
  DollarSign,
  Home,
  Loader2,
  MapPinned,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  UserMinus,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../lib/api'
import { useToasts } from '../../lib/use-toasts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  assignGateLane,
  createGateLane,
  getGateLaneStaff,
  getGateLanes,
  unassignGateLane,
  updateGateLane,
  type GateLaneStaff,
  type GateLaneWithAssignment,
  type GateVehicleType,
} from '../../lib/gate-lanes-api'

type ConfigTab = 'pricing' | 'lanes' | 'layout'

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

const TABS: Array<{ value: ConfigTab; label: string; icon: typeof DollarSign }> = [
  { value: 'pricing', label: 'Pricing', icon: DollarSign },
  { value: 'lanes', label: 'Gate lanes', icon: MapPinned },
  { value: 'layout', label: 'Layout overview', icon: Building2 },
]

const VND = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

function isConfigTab(value: string | null): value is ConfigTab {
  return value === 'pricing' || value === 'lanes' || value === 'layout'
}

export default function Config() {
  const toasts = useToasts()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab: ConfigTab = isConfigTab(requestedTab) ? requestedTab : 'pricing'

  const selectTab = (value: string) => {
    if (!isConfigTab(value)) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', value)
    setSearchParams(next, { replace: true })
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Settings2 className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">System configuration</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Configure parking rules, gate coverage, and building reference data.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="h-6 px-2.5">Manager workspace</Badge>
      </header>

      <Tabs value={activeTab} onValueChange={selectTab} className="gap-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-11 min-w-max p-1" aria-label="Configuration sections">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="h-9 px-4">
                <Icon className="size-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="pricing" className="mt-0">
          <PricingSection toasts={toasts} />
        </TabsContent>
        <TabsContent value="lanes" className="mt-0">
          <GateLaneSection toasts={toasts} />
        </TabsContent>
        <TabsContent value="layout" className="mt-0">
          <BuildingSection toasts={toasts} />
        </TabsContent>
      </Tabs>
    </main>
  )
}

function PricingSection({ toasts }: { toasts: ReturnType<typeof useToasts> }) {
  const [initialValues, setInitialValues] = useState<Record<string, PricingConfig>>({})
  const [values, setValues] = useState<Record<string, PricingConfig>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const loadPricing = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const { data } = await api.get<PricingConfig[]>('/config/pricing')
      const next = Object.fromEntries(data.map((item) => [item.vehicleType, { ...item }]))
      setInitialValues(next)
      setValues(next)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPricing() }, [])

  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues)
  const configs = ['car', 'motorbike'] as const
  const isValid = configs.every((type) => {
    const item = values[type]
    return item && item.hourlyRate >= 0 && item.overtimePenalty >= 0 && item.lostTicketPenalty >= 0 && item.overtimeThresholdHours > 0 && item.overtimeThresholdHours <= 24
  })

  const update = (type: 'car' | 'motorbike', field: keyof PricingConfig, value: number) => {
    setValues((current) => ({ ...current, [type]: { ...current[type], [field]: value } }))
  }

  const save = async () => {
    if (!isValid) {
      toasts.showError('Use non-negative fees and an overtime threshold between 1 and 24 hours.')
      return
    }
    setSaving(true)
    try {
      await Promise.all(configs.map((vehicleType) => api.put('/config/pricing', {
        vehicleType,
        hourlyRate: values[vehicleType].hourlyRate,
        overtimePenalty: values[vehicleType].overtimePenalty,
        lostTicketPenalty: values[vehicleType].lostTicketPenalty,
        overtimeThresholdHours: values[vehicleType].overtimeThresholdHours,
      })))
      setInitialValues(JSON.parse(JSON.stringify(values)) as Record<string, PricingConfig>)
      toasts.showSuccess('Pricing configuration saved')
    } catch (error) {
      const message = isAxiosError(error) && typeof error.response?.data?.message === 'string'
        ? error.response.data.message
        : 'Unable to save pricing configuration'
      toasts.showError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SectionSkeleton rows={5} />
  if (loadError) return <LoadError title="Unable to load pricing" onRetry={loadPricing} />

  return (
    <Card className="overflow-hidden border-primary/15 shadow-sm">
      <CardHeader className="gap-1 border-b bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg">Pricing rules</CardTitle>
          <CardDescription>One policy set for each vehicle type. Changes are applied together.</CardDescription>
        </div>
        {isDirty ? <Badge variant="secondary">Unsaved changes</Badge> : <Badge variant="outline">Saved</Badge>}
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="pb-3 font-medium">Vehicle type</th>
                <th className="pb-3 font-medium">Hourly rate</th>
                <th className="pb-3 font-medium">Overtime surcharge</th>
                <th className="pb-3 font-medium">Lost ticket surcharge</th>
                <th className="pb-3 font-medium">Threshold</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((type) => <PricingRow key={type} type={type} value={values[type]} onChange={update} />)}
            </tbody>
          </table>
        </div>
        <div className="space-y-4 md:hidden">
          {configs.map((type) => <PricingMobileCard key={type} type={type} value={values[type]} onChange={update} />)}
        </div>
        {!isValid ? <Alert variant="destructive"><AlertTitle>Check pricing values</AlertTitle><AlertDescription>Fees cannot be negative and the overtime threshold must be between 1 and 24 hours.</AlertDescription></Alert> : null}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" disabled={!isDirty || saving} onClick={() => setValues(JSON.parse(JSON.stringify(initialValues)) as Record<string, PricingConfig>)}>
            <RotateCcw className="size-4" /> Discard changes
          </Button>
          <Button className="min-h-11" disabled={!isDirty || !isValid || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save pricing
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PricingRow({ type, value, onChange }: { type: 'car' | 'motorbike'; value: PricingConfig; onChange: (type: 'car' | 'motorbike', field: keyof PricingConfig, value: number) => void }) {
  return <tr className="border-b last:border-0">
    <td className="py-4 pr-4"><VehicleTypeLabel type={type} /></td>
    <td className="py-4 pr-3"><MoneyInput label={`${type} hourly rate`} value={value.hourlyRate} onChange={(next) => onChange(type, 'hourlyRate', next)} /></td>
    <td className="py-4 pr-3"><MoneyInput label={`${type} overtime surcharge`} value={value.overtimePenalty} onChange={(next) => onChange(type, 'overtimePenalty', next)} /></td>
    <td className="py-4 pr-3"><MoneyInput label={`${type} lost ticket surcharge`} value={value.lostTicketPenalty} onChange={(next) => onChange(type, 'lostTicketPenalty', next)} /></td>
    <td className="py-4"><HoursInput label={`${type} overtime threshold`} value={value.overtimeThresholdHours} onChange={(next) => onChange(type, 'overtimeThresholdHours', next)} /></td>
  </tr>
}

function PricingMobileCard({ type, value, onChange }: { type: 'car' | 'motorbike'; value: PricingConfig; onChange: (type: 'car' | 'motorbike', field: keyof PricingConfig, value: number) => void }) {
  return <section className="space-y-4 rounded-xl border p-4"><VehicleTypeLabel type={type} /><div className="grid gap-3 sm:grid-cols-2"><Field label="Hourly rate"><MoneyInput label={`${type} hourly rate`} value={value.hourlyRate} onChange={(next) => onChange(type, 'hourlyRate', next)} /></Field><Field label="Overtime surcharge"><MoneyInput label={`${type} overtime surcharge`} value={value.overtimePenalty} onChange={(next) => onChange(type, 'overtimePenalty', next)} /></Field><Field label="Lost ticket surcharge"><MoneyInput label={`${type} lost ticket surcharge`} value={value.lostTicketPenalty} onChange={(next) => onChange(type, 'lostTicketPenalty', next)} /></Field><Field label="Overtime threshold"><HoursInput label={`${type} overtime threshold`} value={value.overtimeThresholdHours} onChange={(next) => onChange(type, 'overtimeThresholdHours', next)} /></Field></div></section>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div> }

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="relative"><Input aria-label={label} type="number" min="0" className="h-11 pr-12 tabular-nums" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">VND</span></div>
}

function HoursInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="relative"><Input aria-label={label} type="number" min="1" max="24" className="h-11 pr-14 tabular-nums" value={value} onChange={(event) => onChange(Number(event.target.value))} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">hours</span></div>
}

function VehicleTypeLabel({ type }: { type: GateVehicleType }) {
  const Icon = type === 'car' ? Car : Bike
  return <div className="flex items-center gap-2 font-medium"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>{type === 'car' ? 'Car' : 'Motorbike'}</div>
}

function GateLaneSection({ toasts }: { toasts: ReturnType<typeof useToasts> }) {
  const [lanes, setLanes] = useState<GateLaneWithAssignment[]>([])
  const [staff, setStaff] = useState<GateLaneStaff[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [laneToDeactivate, setLaneToDeactivate] = useState<GateLaneWithAssignment | null>(null)
  const [assignmentToRemove, setAssignmentToRemove] = useState<{ staffId: string; staffName: string; laneName: string } | null>(null)
  const [draft, setDraft] = useState({ name: '', vehicleType: 'car' as GateVehicleType, staffId: 'unassigned' })

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [laneData, staffData] = await Promise.all([getGateLanes(), getGateLaneStaff()])
      setLanes(laneData)
      setStaff(staffData)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const create = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    try {
      const lane = await createGateLane({ name: draft.name.trim(), vehicleType: draft.vehicleType })
      if (draft.staffId !== 'unassigned') await assignGateLane(lane.id, draft.staffId)
      setDraft({ name: '', vehicleType: 'car', staffId: 'unassigned' })
      setCreateOpen(false)
      toasts.showSuccess('Gate lane created')
      await load()
    } catch {
      toasts.showError('Unable to create the gate lane. Check the lane name and try again.')
    } finally {
      setSaving(false)
    }
  }

  const mutateLane = async (action: string, work: () => Promise<unknown>, success: string) => {
    setPendingAction(action)
    try {
      await work()
      toasts.showSuccess(success)
      await load()
    } catch {
      toasts.showError('Unable to update this lane. Please try again.')
    } finally {
      setPendingAction(null)
    }
  }

  const activeStaff = staff.filter((person) => person.isActive && !person.gateAssignment)
  const assignedCount = lanes.reduce((count, lane) => count + lane.assignments.length, 0)

  if (loading) return <SectionSkeleton rows={4} />
  if (loadError) return <LoadError title="Unable to load gate lanes" onRetry={load} />

  return <>
    <Card className="overflow-hidden border-primary/15 shadow-sm">
      <CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
        <div><CardTitle className="text-lg">Gate lane assignments</CardTitle><CardDescription>Each staff member can operate one active Car or Motorbike lane. Inactive lanes block all gate operations.</CardDescription></div>
        <Button className="min-h-11" onClick={() => setCreateOpen(true)}><Plus className="size-4" />Create lane</Button>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active lanes" value={lanes.filter((lane) => lane.isActive).length} />
          <Metric label="Gate closed" value={lanes.filter((lane) => !lane.isActive).length} tone="danger" />
          <Metric label="Staff assigned" value={assignedCount} />
          <Metric label="Available staff" value={activeStaff.length} />
        </div>
        {lanes.length === 0 ? <EmptyLanes onCreate={() => setCreateOpen(true)} /> : <LaneTable lanes={lanes} staff={staff} pendingAction={pendingAction} onAssign={(laneId, staffId) => void mutateLane(`assign-${laneId}`, () => assignGateLane(laneId, staffId), 'Staff assignment updated')} onRequestUnassign={(staffId, staffName, laneName) => setAssignmentToRemove({ staffId, staffName, laneName })} onToggle={(lane) => lane.isActive ? setLaneToDeactivate(lane) : void mutateLane(`activate-${lane.id}`, () => updateGateLane(lane.id, { isActive: true }), 'Gate lane activated')} />}
      </CardContent>
    </Card>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="px-5 pt-5"><DialogTitle>Create gate lane</DialogTitle><DialogDescription>Name the physical lane and optionally assign an available staff member. The lane code is generated automatically.</DialogDescription></DialogHeader>
        <form className="space-y-5 px-5 pb-5" onSubmit={(event) => { event.preventDefault(); void create() }}>
          <Field label="Lane name"><Input autoFocus className="h-11" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. North gate car lane" /></Field>
          <Field label="Vehicle type"><Select value={draft.vehicleType} onValueChange={(value) => setDraft({ ...draft, vehicleType: value as GateVehicleType })}><SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="car">Car</SelectItem><SelectItem value="motorbike">Motorbike</SelectItem></SelectContent></Select></Field>
          <Field label="Assign staff"><Select value={draft.staffId} onValueChange={(value) => setDraft({ ...draft, staffId: value })}><SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Assign later</SelectItem>{activeStaff.map((person) => <SelectItem key={person.id} value={person.id}>{staffName(person)}</SelectItem>)}</SelectContent></Select></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !draft.name.trim()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Create lane</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(laneToDeactivate)} onOpenChange={(open) => { if (!open) setLaneToDeactivate(null) }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Deactivate this gate lane?</AlertDialogTitle><AlertDialogDescription>{laneToDeactivate?.name} will immediately block its assigned staff from gate operations until the lane is activated again.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (laneToDeactivate) void mutateLane(`deactivate-${laneToDeactivate.id}`, () => updateGateLane(laneToDeactivate.id, { isActive: false }), 'Gate lane deactivated'); setLaneToDeactivate(null) }}>Deactivate lane</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={Boolean(assignmentToRemove)} onOpenChange={(open) => { if (!open) setAssignmentToRemove(null) }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove staff assignment?</AlertDialogTitle><AlertDialogDescription>{assignmentToRemove?.staffName} will no longer be assigned to {assignmentToRemove?.laneName} and will be blocked from gate operations until assigned to an active lane.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { if (assignmentToRemove) void mutateLane(`unassign-${assignmentToRemove.staffId}`, () => unassignGateLane(assignmentToRemove.staffId), 'Staff removed from lane'); setAssignmentToRemove(null) }}>Remove assignment</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </>
}

function LaneTable({ lanes, staff, pendingAction, onAssign, onRequestUnassign, onToggle }: { lanes: GateLaneWithAssignment[]; staff: GateLaneStaff[]; pendingAction: string | null; onAssign: (laneId: string, staffId: string) => void; onRequestUnassign: (staffId: string, staffName: string, laneName: string) => void; onToggle: (lane: GateLaneWithAssignment) => void }) {
  return <div className="rounded-xl border"><Table><TableHeader><TableRow><TableHead>Lane</TableHead><TableHead>Coverage</TableHead><TableHead>Assigned staff</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{lanes.map((lane) => {
    const assignment = lane.assignments[0]
    const eligible = staff.filter((person) => person.isActive && (!person.gateAssignment || person.gateAssignment.gateLane.id === lane.id))
    const busy = pendingAction?.includes(lane.id) || (assignment ? pendingAction?.includes(assignment.staffId) : false)
    return <TableRow key={lane.id} className={!lane.isActive ? 'border-l-4 border-l-destructive bg-destructive/[0.04] hover:bg-destructive/[0.08]' : undefined}><TableCell><div className="font-medium">{lane.name}</div><div className="font-mono text-xs text-muted-foreground">{lane.code}</div></TableCell><TableCell><div className="space-y-1.5"><div className="flex items-center gap-2"><VehicleTypeLabel type={lane.vehicleType} /><Badge variant={lane.isActive ? 'outline' : 'destructive'}>{lane.isActive ? 'Active' : 'Gate closed'}</Badge></div>{!lane.isActive ? <p className="text-xs font-medium text-destructive">Staff access is blocked</p> : null}</div></TableCell><TableCell><div className="space-y-1.5"><div className="flex min-w-52 items-center gap-2"><Select value={assignment?.staffId ?? 'unassigned'} onValueChange={(value) => { if (value !== 'unassigned') onAssign(lane.id, value) }} disabled={!lane.isActive || Boolean(busy)}><SelectTrigger className="h-11 min-w-0 flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{eligible.map((person) => <SelectItem key={person.id} value={person.id}>{staffName(person)}</SelectItem>)}</SelectContent></Select>{assignment ? <Button variant="outline" className="min-h-11 shrink-0 border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={Boolean(busy)} onClick={() => onRequestUnassign(assignment.staffId, staffName(assignment.staff), lane.name)}><UserMinus className="size-4" />Remove</Button> : null}</div>{!lane.isActive ? <p className="text-xs text-muted-foreground">Assignment is preserved until the lane is reactivated.</p> : null}</div></TableCell><TableCell className="text-right"><Button variant={lane.isActive ? 'outline' : 'default'} className="min-h-11" disabled={Boolean(busy)} onClick={() => onToggle(lane)}>{busy ? <Loader2 className="size-4 animate-spin" /> : lane.isActive ? 'Deactivate' : 'Activate lane'}</Button></TableCell></TableRow>
  })}</TableBody></Table></div>
}

function EmptyLanes({ onCreate }: { onCreate: () => void }) { return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center"><MapPinned className="size-8 text-muted-foreground" /><h3 className="mt-3 font-medium">No gate lanes yet</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Create the physical lanes first, then assign staff to control access at each gate.</p><Button className="mt-5 min-h-11" onClick={onCreate}><Plus className="size-4" />Create first lane</Button></div> }

function BuildingSection({ toasts }: { toasts: ReturnType<typeof useToasts> }) {
  const [building, setBuilding] = useState<BuildingConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const load = async () => { setLoading(true); setLoadError(false); try { const { data } = await api.get<BuildingConfig>('/config/building'); setBuilding(data) } catch { setLoadError(true); toasts.showError('Unable to load building layout') } finally { setLoading(false) } }
  useEffect(() => { void load() }, [])
  if (loading) return <SectionSkeleton rows={4} />
  if (loadError || !building) return <LoadError title="Unable to load building layout" onRetry={load} />
  return <Card className="overflow-hidden border-primary/15 shadow-sm"><CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><CardTitle className="text-lg">Layout overview</CardTitle><Badge variant="secondary">Read only</Badge></div><CardDescription>Reference capacity and occupancy by floor. Slot management happens in the dashboard.</CardDescription></div><Button asChild variant="outline" className="min-h-11"><Link to="/manager/dashboard"><MapPinned className="size-4" />Manage slots</Link></Button></CardHeader><CardContent className="space-y-5 p-4 sm:p-6"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Floors" value={building.summary.totalFloors} /><Metric label="Car slots / floor" value={building.summary.slotsPerFloorZoneA} /><Metric label="Motorbike slots / floor" value={building.summary.slotsPerFloorZoneB} /></div><div className="space-y-3">{building.floors.map((floor) => <FloorDisclosure key={floor.id} floor={floor} />)}</div></CardContent></Card>
}

function FloorDisclosure({ floor }: { floor: BuildingFloor }) {
  return <details className="group rounded-xl border bg-card open:bg-muted/10"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"><span className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><Home className="size-4" /></span>{floor.name}<span className="text-sm font-normal text-muted-foreground">Floor {floor.floorNumber}</span></span><ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" /></summary><div className="grid gap-3 border-t p-4 sm:grid-cols-2"><ZoneSnapshot icon={Car} label="Car zone" data={floor.zoneA} /><ZoneSnapshot icon={Bike} label="Motorbike zone" data={floor.zoneB} /></div></details>
}

function ZoneSnapshot({ icon: Icon, label, data }: { icon: typeof Car; label: string; data: BuildingFloor['zoneA'] }) { const used = data.occupied + data.maintenance; const percent = data.total ? Math.round((used / data.total) * 100) : 0; return <section className="rounded-lg border bg-background p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-medium"><Icon className="size-4 text-primary" />{label}</div><span className="tabular-nums text-sm text-muted-foreground">{used} / {data.total}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} /></div><div className="mt-3 flex gap-3 text-xs text-muted-foreground"><span><strong className="text-foreground">{data.occupied}</strong> occupied</span><span><strong className="text-foreground">{data.maintenance}</strong> maintenance</span></div></section> }

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'danger' }) { return <div className={`rounded-xl border p-4 ${tone === 'danger' ? 'border-destructive/30 bg-destructive/[0.05]' : 'bg-muted/20'}`}><p className={`text-xs font-medium uppercase tracking-wide ${tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}`}>{label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-destructive' : ''}`}>{VND(value)}</p></div> }
function staffName(staff: Pick<GateLaneStaff, 'fullName' | 'username' | 'phone'>) { return staff.fullName || staff.username || staff.phone }
function SectionSkeleton({ rows }: { rows: number }) { return <Card><CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-72" /></CardHeader><CardContent className="space-y-3">{Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}</CardContent></Card> }
function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) { return <Alert variant="destructive"><AlertTitle>{title}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3">Check the server connection and try again.<Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="size-4" />Retry</Button></AlertDescription></Alert> }
