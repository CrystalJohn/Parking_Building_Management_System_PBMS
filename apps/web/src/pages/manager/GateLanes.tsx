import { useEffect, useState, type ReactNode } from 'react'
import {
  Bike,
  Car,
  Loader2,
  MapPinned,
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
} from '@/lib/gate-lanes-api'

const VND = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

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
            <h1 className="text-2xl font-bold tracking-tight">Gate Lane Management</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Assign staff members to active gate lanes and monitor live entrance & exit lane operations.
          </p>
        </div>
        <Badge variant="outline" className="h-6 px-2.5">
          Manager workspace
        </Badge>
      </header>

      <GateLaneSection />
    </main>
  )
}

function GateLaneSection() {
  const [lanes, setLanes] = useState<GateLaneWithAssignment[]>([])
  const [staff, setStaff] = useState<GateLaneStaff[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [laneToDeactivate, setLaneToDeactivate] = useState<GateLaneWithAssignment | null>(null)
  const [assignmentToRemove, setAssignmentToRemove] = useState<{
    staffId: string
    staffName: string
    laneName: string
  } | null>(null)
  const [draft, setDraft] = useState({
    name: '',
    vehicleType: 'car' as GateVehicleType,
    staffId: 'unassigned',
  })

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

  useEffect(() => {
    void load()
  }, [])

  const create = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    try {
      const lane = await createGateLane({ name: draft.name.trim(), vehicleType: draft.vehicleType })
      if (draft.staffId !== 'unassigned') await assignGateLane(lane.id, draft.staffId)
      setDraft({ name: '', vehicleType: 'car', staffId: 'unassigned' })
      setCreateOpen(false)
      toast.success('Gate lane created')
      await load()
    } catch {
      toast.error('Unable to create the gate lane. Check the lane name and try again.')
    } finally {
      setSaving(false)
    }
  }

  const mutateLane = async (action: string, work: () => Promise<unknown>, success: string) => {
    setPendingAction(action)
    try {
      await work()
      toast.success(success)
      await load()
    } catch {
      toast.error('Unable to update this lane. Please try again.')
    } finally {
      setPendingAction(null)
    }
  }

  const activeStaff = staff.filter((person) => person.isActive && !person.gateAssignment)
  const assignedCount = lanes.reduce((count, lane) => count + lane.assignments.length, 0)

  if (loading) return <SectionSkeleton rows={4} />
  if (loadError) return <LoadError title="Unable to load gate lanes" onRetry={load} />

  return (
    <>
      <Card className="overflow-hidden border-primary/15 shadow-sm">
        <CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Gate lane assignments</CardTitle>
            <CardDescription>
              Each staff member can operate one active Car or Motorbike lane. Inactive lanes block all gate operations.
            </CardDescription>
          </div>
          <Button className="min-h-11" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Create lane
          </Button>
        </CardHeader>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Active lanes" value={lanes.filter((lane) => lane.isActive).length} />
            <Metric label="Gate closed" value={lanes.filter((lane) => !lane.isActive).length} tone="danger" />
            <Metric label="Staff assigned" value={assignedCount} />
            <Metric label="Available staff" value={activeStaff.length} />
          </div>
          {lanes.length === 0 ? (
            <EmptyLanes onCreate={() => setCreateOpen(true)} />
          ) : (
            <LaneTable
              lanes={lanes}
              staff={staff}
              pendingAction={pendingAction}
              onAssign={(laneId, staffId) =>
                void mutateLane(`assign-${laneId}`, () => assignGateLane(laneId, staffId), 'Staff assignment updated')
              }
              onRequestUnassign={(staffId, staffName, laneName) =>
                setAssignmentToRemove({ staffId, staffName, laneName })
              }
              onToggle={(lane) =>
                lane.isActive
                  ? setLaneToDeactivate(lane)
                  : void mutateLane(
                      `activate-${lane.id}`,
                      () => updateGateLane(lane.id, { isActive: true }),
                      'Gate lane activated',
                    )
              }
            />
          )}
        </CardContent>
      </Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Create gate lane</DialogTitle>
            <DialogDescription>
              Name the physical lane and optionally assign an available staff member. The lane code is generated automatically.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5 px-5 pb-5"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <Field label="Lane name">
              <Input
                autoFocus
                className="h-11"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="e.g. North gate car lane"
              />
            </Field>
            <Field label="Vehicle type">
              <Select
                value={draft.vehicleType}
                onValueChange={(value) => setDraft({ ...draft, vehicleType: value as GateVehicleType })}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="motorbike">Motorbike</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assign staff">
              <Select
                value={draft.staffId}
                onValueChange={(value) => setDraft({ ...draft, staffId: value })}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Assign later</SelectItem>
                  {activeStaff.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {staffName(person)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !draft.name.trim()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create lane
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
                  void mutateLane(
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
                  void mutateLane(
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

function LaneTable({
  lanes,
  staff,
  pendingAction,
  onAssign,
  onRequestUnassign,
  onToggle,
}: {
  lanes: GateLaneWithAssignment[]
  staff: GateLaneStaff[]
  pendingAction: string | null
  onAssign: (laneId: string, staffId: string) => void
  onRequestUnassign: (staffId: string, staffName: string, laneName: string) => void
  onToggle: (lane: GateLaneWithAssignment) => void
}) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lane</TableHead>
            <TableHead>Coverage</TableHead>
            <TableHead>Assigned staff</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lanes.map((lane) => {
            const assignment = lane.assignments[0]
            const eligible = staff.filter(
              (person) =>
                person.isActive &&
                (!person.gateAssignment || person.gateAssignment.gateLane.id === lane.id),
            )
            const busy =
              pendingAction?.includes(lane.id) ||
              (assignment ? pendingAction?.includes(assignment.staffId) : false)

            return (
              <TableRow
                key={lane.id}
                className={
                  !lane.isActive
                    ? 'border-l-4 border-l-destructive bg-destructive/[0.04] hover:bg-destructive/[0.08]'
                    : undefined
                }
              >
                <TableCell>
                  <div className="font-medium">{lane.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{lane.code}</div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <VehicleTypeLabel type={lane.vehicleType} />
                      <Badge variant={lane.isActive ? 'outline' : 'destructive'}>
                        {lane.isActive ? 'Active' : 'Gate closed'}
                      </Badge>
                    </div>
                    {!lane.isActive ? (
                      <p className="text-xs font-medium text-destructive">Staff access is blocked</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    <div className="flex min-w-52 items-center gap-2">
                      <Select
                        value={assignment?.staffId ?? 'unassigned'}
                        onValueChange={(value) => {
                          if (value !== 'unassigned') onAssign(lane.id, value)
                        }}
                        disabled={!lane.isActive || Boolean(busy)}
                      >
                        <SelectTrigger className="h-11 min-w-0 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {eligible.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {staffName(person)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {assignment ? (
                        <Button
                          variant="outline"
                          className="min-h-11 shrink-0 border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            onRequestUnassign(assignment.staffId, staffName(assignment.staff), lane.name)
                          }
                        >
                          <UserMinus className="size-4" /> Remove
                        </Button>
                      ) : null}
                    </div>
                    {!lane.isActive ? (
                      <p className="text-xs text-muted-foreground">
                        Assignment is preserved until the lane is reactivated.
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={lane.isActive ? 'outline' : 'default'}
                    className="min-h-11"
                    disabled={Boolean(busy)}
                    onClick={() => onToggle(lane)}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : lane.isActive ? (
                      'Deactivate'
                    ) : (
                      'Activate lane'
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function EmptyLanes({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      <MapPinned className="size-8 text-muted-foreground" />
      <h3 className="mt-3 font-medium">No gate lanes yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Create the physical lanes first, then assign staff to control access at each gate.
      </p>
      <Button className="mt-5 min-h-11" onClick={onCreate}>
        <Plus className="size-4" /> Create first lane
      </Button>
    </div>
  )
}

function VehicleTypeLabel({ type }: { type: GateVehicleType }) {
  const Icon = type === 'car' ? Car : Bike
  return (
    <div className="flex items-center gap-2 font-medium">
      <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      {type === 'car' ? 'Car' : 'Motorbike'}
    </div>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'danger' }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === 'danger' ? 'border-destructive/30 bg-destructive/[0.05]' : 'bg-muted/20'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}`}>
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-destructive' : ''}`}>
        {VND(value)}
      </p>
    </div>
  )
}

function staffName(staff: Pick<GateLaneStaff, 'fullName' | 'username' | 'phone'>) {
  return staff.fullName || staff.username || staff.phone
}

function SectionSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        Check the server connection and try again.
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4" /> Retry
        </Button>
      </AlertDescription>
    </Alert>
  )
}
