import { useEffect, useState, type ReactNode } from 'react'
import {
  Bike,
  Car,
  DoorOpen,
  LogIn,
  LogOut,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  UserMinus,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  assignGateLane,
  createGate,
  createGateLane,
  getGateLaneFloors,
  getGateLaneStaff,
  getGateLanes,
  getGates,
  unassignGateLane,
  updateGate,
  updateGateLane,
  type BuildingFloor,
  type Gate,
  type GateLaneStaff,
  type GateLaneWithAssignment,
  type GateType,
  type GateVehicleType,
} from '@/lib/gate-lanes-api'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}

export default function GateLanes() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Gate & Lane Management</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Building gates are classified as Check-in or Check-out. Each gate contains Car and Motorbike lanes
            staffed per floor. Assign staff to control access.
          </p>
        </div>
        <Badge variant="outline" className="h-6 px-2.5">
          Manager workspace
        </Badge>
      </header>

      <GateManager />
    </main>
  )
}

function GateManager() {
  const [gates, setGates] = useState<Gate[]>([])
  const [lanes, setLanes] = useState<GateLaneWithAssignment[]>([])
  const [staff, setStaff] = useState<GateLaneStaff[]>([])
  const [floors, setFloors] = useState<BuildingFloor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [createGateOpen, setCreateGateOpen] = useState(false)
  const [createLaneOpen, setCreateLaneOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [gateToDeactivate, setGateToDeactivate] = useState<Gate | null>(null)
  const [laneToDeactivate, setLaneToDeactivate] = useState<GateLaneWithAssignment | null>(null)
  const [assignmentToRemove, setAssignmentToRemove] = useState<{
    staffId: string
    staffName: string
    laneName: string
  } | null>(null)
  const [gateDraft, setGateDraft] = useState({
    name: '',
    gateType: 'CHECK_IN' as GateType,
    floorId: 'none' as string,
  })
  const [laneDraft, setLaneDraft] = useState({
    name: '',
    vehicleType: 'car' as GateVehicleType,
    gateId: 'none' as string,
    staffId: 'unassigned',
  })

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [gateData, laneData, staffData, floorData] = await Promise.all([
        getGates(),
        getGateLanes(),
        getGateLaneStaff(),
        getGateLaneFloors(),
      ])
      setGates(gateData)
      setLanes(laneData)
      setStaff(staffData)
      setFloors(floorData)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const mutate = async (action: string, work: () => Promise<unknown>, success: string) => {
    setPendingAction(action)
    try {
      await work()
      toast.success(success)
      await load()
    } catch {
      toast.error('Unable to update. Please try again.')
    } finally {
      setPendingAction(null)
    }
  }

  const createGate_ = async () => {
    if (!gateDraft.name.trim()) return
    setSaving(true)
    try {
      await createGate({
        name: gateDraft.name.trim(),
        gateType: gateDraft.gateType,
        floorId: gateDraft.floorId === 'none' ? null : Number(gateDraft.floorId),
      })
      setGateDraft({ name: '', gateType: 'CHECK_IN', floorId: 'none' })
      setCreateGateOpen(false)
      toast.success('Gate created')
      await load()
    } catch {
      toast.error('Unable to create the gate. Check the name and try again.')
    } finally {
      setSaving(false)
    }
  }

  const createLane = async () => {
    if (!laneDraft.name.trim()) return
    setSaving(true)
    try {
      const lane = await createGateLane({
        name: '',
        vehicleType: laneDraft.vehicleType,
        gateId: laneDraft.gateId === 'none' ? null : laneDraft.gateId,
      })
      if (laneDraft.staffId !== 'unassigned') await assignGateLane(lane.id, laneDraft.staffId)
      setLaneDraft({ name: '', vehicleType: 'car', gateId: 'none', staffId: 'unassigned' })
      setCreateLaneOpen(false)
      toast.success('Gate lane created')
      await load()
    } catch {
      toast.error('Unable to create the gate lane. Check the lane name and try again.')
    } finally {
      setSaving(false)
    }
  }

  const lanesByGate = (gateId: string) => lanes.filter((lane) => lane.gateId === gateId)
  const unassignedLanes = lanes.filter((lane) => !lane.gateId)
  const activeStaff = staff.filter((person) => person.isActive && !person.gateAssignment)

  if (loading) return <SectionSkeleton rows={4} />
  if (loadError) return <LoadError title="Unable to load gates" onRetry={load} />

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button className="min-h-11" onClick={() => setCreateGateOpen(true)}>
          <Plus className="size-4" /> Create gate
        </Button>
        <Button variant="outline" className="min-h-11" onClick={() => setCreateLaneOpen(true)}>
          <Plus className="size-4" /> Create lane
        </Button>
      </div>

      {(['CHECK_IN', 'CHECK_OUT'] as GateType[]).map((type) => {
        const group = gates.filter((g) => g.gateType === type)
        return (
          <Card key={type} className="overflow-hidden shadow-sm">
            <CardHeader className="gap-2 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                {type === 'CHECK_IN' ? (
                  <LogIn className="size-5 text-emerald-600" />
                ) : (
                  <LogOut className="size-5 text-amber-600" />
                )}
                <CardTitle className="text-lg">
                  {type === 'CHECK_IN' ? 'Check-in gates' : 'Check-out gates'}
                </CardTitle>
                <Badge variant="outline" className="ml-1">{group.length}</Badge>
              </div>
              <CardDescription>
                {type === 'CHECK_IN'
                  ? 'Entrance gates where vehicles are checked in (per floor).'
                  : 'Exit gates where vehicles complete payment and leave (ground floor).'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
              {group.length === 0 ? (
                <p className="text-sm text-muted-foreground">No {type === 'CHECK_IN' ? 'check-in' : 'check-out'} gates yet.</p>
              ) : (
                group.map((gate) => (
                  <GateCard
                    key={gate.id}
                    gate={gate}
                    gateLanes={lanesByGate(gate.id)}
                    staff={staff}
                    pendingAction={pendingAction}
                    onAssign={(laneId, staffId) =>
                      void mutate(`assign-${laneId}`, () => assignGateLane(laneId, staffId), 'Staff assignment updated')
                    }
                    onRequestUnassign={(staffId, staffName, laneName) =>
                      setAssignmentToRemove({ staffId, staffName, laneName })
                    }
                    onToggleLane={(lane) => (lane.isActive ? setLaneToDeactivate(lane) : void mutate(`activate-${lane.id}`, () => updateGateLane(lane.id, { isActive: true }), 'Gate lane activated'))}
                    onToggleGate={() => (gate.isActive ? setGateToDeactivate(gate) : void mutate(`gate-activate-${gate.id}`, () => updateGate(gate.id, { isActive: true }), 'Gate activated'))}
                  />
                ))
              )}
            </CardContent>
          </Card>
        )
      })}

      {unassignedLanes.length > 0 && (
        <Card className="overflow-hidden border-dashed shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Lanes without a gate</CardTitle>
            <CardDescription>Assign these lanes to a gate from the lane editor (coming soon) or recreate them under a gate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {unassignedLanes.map((lane) => (
              <div key={lane.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <VehicleTypeLabel type={lane.vehicleType} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Create Gate dialog */}
      <Dialog open={createGateOpen} onOpenChange={setCreateGateOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Create gate</DialogTitle>
            <DialogDescription>Classify the gate as Check-in or Check-out and place it on a floor.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5 px-5 pb-5"
            onSubmit={(event) => { event.preventDefault(); void createGate_() }}
          >
            <Field label="Gate name">
              <Input
                autoFocus
                className="h-11"
                value={gateDraft.name}
                onChange={(event) => setGateDraft({ ...gateDraft, name: event.target.value })}
                placeholder="e.g. Ground floor check-out"
              />
            </Field>
            <Field label="Gate type">
              <Select
                value={gateDraft.gateType}
                onValueChange={(value) => setGateDraft({ ...gateDraft, gateType: value as GateType })}
              >
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHECK_IN">Check-in</SelectItem>
                  <SelectItem value="CHECK_OUT">Check-out</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Floor">
              <Select
                value={gateDraft.floorId}
                onValueChange={(value) => setGateDraft({ ...gateDraft, floorId: value })}
              >
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No floor assigned</SelectItem>
                  {floors.map((floor) => (
                    <SelectItem key={floor.id} value={String(floor.id)}>{floor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateGateOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || !gateDraft.name.trim()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create gate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Lane dialog */}
      <Dialog open={createLaneOpen} onOpenChange={setCreateLaneOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Create gate lane</DialogTitle>
            <DialogDescription>Name the physical lane, attach it to a gate, and optionally assign staff.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5 px-5 pb-5"
            onSubmit={(event) => { event.preventDefault(); void createLane() }}
          >
            <Field label="Lane name">
              <Input
                autoFocus
                className="h-11"
                value={laneDraft.name}
                onChange={(event) => setLaneDraft({ ...laneDraft, name: event.target.value })}
                placeholder="e.g. North gate car lane"
              />
            </Field>
            <Field label="Vehicle type">
              <Select
                value={laneDraft.vehicleType}
                onValueChange={(value) => setLaneDraft({ ...laneDraft, vehicleType: value as GateVehicleType })}
              >
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="motorbike">Motorbike</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Gate">
              <Select
                value={laneDraft.gateId}
                onValueChange={(value) => setLaneDraft({ ...laneDraft, gateId: value })}
              >
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No gate assigned</SelectItem>
                  {gates.map((gate) => (
                    <SelectItem key={gate.id} value={gate.id}>
                      {gate.name} ({gate.gateType === 'CHECK_IN' ? 'In' : 'Out'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assign staff">
              <Select
                value={laneDraft.staffId}
                onValueChange={(value) => setLaneDraft({ ...laneDraft, staffId: value })}
              >
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Assign later</SelectItem>
                  {activeStaff.map((person) => (
                    <SelectItem key={person.id} value={person.id}>{staffName(person)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateLaneOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || !laneDraft.name.trim()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create lane
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate gate */}
      <AlertDialog open={Boolean(gateToDeactivate)} onOpenChange={(open) => { if (!open) setGateToDeactivate(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this gate?</AlertDialogTitle>
            <AlertDialogDescription>
              {gateToDeactivate?.name} and its lanes will immediately block assigned staff from gate operations until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (gateToDeactivate)
                  void mutate(
                    `gate-deactivate-${gateToDeactivate.id}`,
                    () => updateGate(gateToDeactivate.id, { isActive: false }),
                    'Gate deactivated',
                  )
                setGateToDeactivate(null)
              }}
            >
              Deactivate gate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate lane */}
      <AlertDialog open={Boolean(laneToDeactivate)} onOpenChange={(open) => { if (!open) setLaneToDeactivate(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this gate lane?</AlertDialogTitle>
            <AlertDialogDescription>
              {laneToDeactivate?.name} will immediately block its assigned staff from gate operations until the lane is activated again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (laneToDeactivate)
                  void mutate(
                    `deactivate-${laneToDeactivate.id}`,
                    () => updateGateLane(laneToDeactivate.id, { isActive: false }),
                    'Gate lane deactivated',
                  )
                setLaneToDeactivate(null)
              }}
            >
              Deactivate lane
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove assignment */}
      <AlertDialog open={Boolean(assignmentToRemove)} onOpenChange={(open) => { if (!open) setAssignmentToRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove staff assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              {assignmentToRemove?.staffName} will no longer be assigned to {assignmentToRemove?.laneName} and will be blocked from gate operations until assigned to an active lane.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (assignmentToRemove)
                  void mutate(
                    `unassign-${assignmentToRemove.staffId}`,
                    () => unassignGateLane(assignmentToRemove.staffId),
                    'Staff removed from lane',
                  )
                setAssignmentToRemove(null)
              }}
            >
              Remove assignment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function GateCard({
  gate,
  gateLanes,
  staff,
  pendingAction,
  onAssign,
  onRequestUnassign,
  onToggleLane,
  onToggleGate,
}: {
  gate: Gate
  gateLanes: GateLaneWithAssignment[]
  staff: GateLaneStaff[]
  pendingAction: string | null
  onAssign: (laneId: string, staffId: string) => void
  onRequestUnassign: (staffId: string, staffName: string, laneName: string) => void
  onToggleLane: (lane: GateLaneWithAssignment) => void
  onToggleGate: () => void
}) {
  return (
    <div className={`rounded-xl border p-4 ${!gate.isActive ? 'border-destructive/40 bg-destructive/[0.04]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DoorOpen className="size-4 text-primary" />
          <span className="font-semibold">{gate.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{gate.code}</span>
          {gate.floor ? <Badge variant="outline">{gate.floor.name}</Badge> : null}
          <Badge className={gate.isActive ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}>{gate.isActive ? 'Active' : 'Inactive'}</Badge>
        </div>
        <Button variant={gate.isActive ? 'outline' : 'default'} className="min-h-9" disabled={Boolean(pendingAction?.includes(gate.id))} onClick={onToggleGate}>
          {pendingAction?.includes(gate.id) ? <Loader2 className="size-4 animate-spin" /> : gate.isActive ? 'Deactivate' : 'Activate'}
        </Button>
      </div>

      {gateLanes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No lanes attached to this gate yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {gateLanes.map((lane) => {
            const assignment = lane.assignments[0]
            const eligible = staff.filter(
              (person) => person.isActive && (!person.gateAssignment || person.gateAssignment.gateLane.id === lane.id),
            )
            const busy = pendingAction?.includes(lane.id) || (assignment ? pendingAction?.includes(assignment.staffId) : false)
            return (
              <div
                key={lane.id}
                className={`rounded-lg border p-3 ${!lane.isActive ? 'border-l-4 border-l-destructive bg-destructive/[0.04]' : lane.vehicleType === 'car' ? 'bg-slate-100 border-slate-200' : 'bg-sky-50 border-sky-200'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <VehicleTypeLabel type={lane.vehicleType} />
                  </div>
                  <Button variant={lane.isActive ? 'outline' : 'default'} className="min-h-9" disabled={Boolean(busy)} onClick={() => onToggleLane(lane)}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : lane.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Assigned staff">
                    <div className="flex items-center gap-2">
                      <Select
                        value={assignment?.staffId ?? 'unassigned'}
                        onValueChange={(value) => { if (value !== 'unassigned') onAssign(lane.id, value) }}
                        disabled={!lane.isActive || Boolean(busy)}
                      >
                        <SelectTrigger className="h-10 flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {eligible.map((person) => (
                            <SelectItem key={person.id} value={person.id}>{staffName(person)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {assignment ? (
                        <Button
                          variant="outline"
                          className="min-h-10 shrink-0 border-destructive/60 text-destructive hover:bg-destructive/10"
                          disabled={Boolean(busy)}
                          onClick={() => onRequestUnassign(assignment.staffId, staffName(assignment.staff), lane.name)}
                        >
                          <UserMinus className="size-4" /> Remove
                        </Button>
                      ) : null}
                    </div>
                  </Field>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function VehicleTypeLabel({ type }: { type: GateVehicleType }) {
  const Icon = type === 'car' ? Car : Bike
  return (
    <div className="flex items-center gap-1.5 font-medium text-sm">
      <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-3.5" />
      </span>
      {type === 'car' ? 'Car' : 'Motorbike'}
    </div>
  )
}

function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>Something went wrong while loading. Check your connection and try again.</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </CardContent>
    </Card>
  )
}

function staffName(staff: Pick<GateLaneStaff, 'fullName' | 'username' | 'phone'>) {
  return staff.fullName || staff.username || staff.phone
}
