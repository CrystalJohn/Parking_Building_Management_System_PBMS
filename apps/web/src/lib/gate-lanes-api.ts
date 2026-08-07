import api from './api'

export type GateVehicleType = 'car' | 'motorbike'

export type GateType = 'CHECK_IN' | 'CHECK_OUT'

export interface GateLane {
  id: string
  code: string
  name: string
  vehicleType: GateVehicleType
  gateId: string | null
  gate: { id: string; code: string; name: string; gateType: GateType; floor?: { id: number; floorNumber: number; name: string } | null } | null
  floorId: number | null
  floor: { id: number; floorNumber: number; name: string } | null
  cameraId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface BuildingFloor {
  id: number
  floorNumber: number
  name: string
}

export interface Gate {
  id: string
  code: string
  name: string
  gateType: GateType
  floorId: number | null
  floor: { id: number; floorNumber: number; name: string } | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  lanes: Array<{
    id: string
    code: string
    name: string
    vehicleType: GateVehicleType
    floorId: number | null
    isActive: boolean
  }>
}

export interface CurrentGateAssignment {
  staffId: string
  gateLane: GateLane
}

export interface GateLaneStaff {
  id: string
  fullName: string | null
  phone: string
  username: string | null
  isActive: boolean
  gateAssignment: { gateLane: GateLane } | null
}

export interface GateLaneWithAssignment extends GateLane {
  assignments: Array<{
    staffId: string
    assignedAt: string
    updatedAt: string
    staff: Pick<GateLaneStaff, 'id' | 'fullName' | 'phone' | 'username' | 'isActive'>
  }>
}

export type GateCoverageStatus =
  | 'fixed_covered'
  | 'fixed_unassigned'
  | 'scheduled_unclaimed'
  | 'on_duty'
  | 'substitute_on_duty'
  | 'unassigned_on_duty'
  | 'inactive'

export interface CurrentGateCoverage {
  asOf: string
  timezone: string
  mode: 'fixed_assignment' | 'scheduled_shift'
  currentShift: { code: string; label: string; startsAt: string; endsAt: string }
  summary: { total: number; covered: number; unassigned: number; inactive: number }
  lanes: Array<{
    lane: GateLane
    eligibleStaff: Array<Pick<GateLaneStaff, 'id' | 'fullName' | 'phone' | 'username' | 'isActive'>>
    scheduledStaff: GateLaneStaff | null
    activeDuty: { staff: GateLaneStaff; startedAt: string; kind: string } | null
    lastActivity: { operation: string; occurredAt: string; staffName: string | null } | null
    status: GateCoverageStatus
  }>
}

export async function getCurrentGateCoverage() {
  const { data } = await api.get<CurrentGateCoverage>('/gate-lanes/coverage/current')
  return data
}

export async function getCurrentGateLane() {
  const { data } = await api.get<CurrentGateAssignment | null>('/gate-lanes/current')
  return data
}

export async function getGateLanes() {
  const { data } = await api.get<GateLaneWithAssignment[]>('/gate-lanes')
  return data
}

export async function getGateLaneFloors() {
  const { data } = await api.get<BuildingFloor[]>('/gate-lanes/floors')
  return data
}

export async function getGates() {
  const { data } = await api.get<Gate[]>('/gates')
  return data
}

export async function createGate(input: { name: string; gateType: GateType; floorId?: number | null; cameraId?: string }) {
  const { data } = await api.post<Gate>('/gates', input)
  return data
}

export async function updateGate(id: string, input: Partial<{ name: string; gateType: GateType; floorId: number | null; cameraId: string | null; isActive: boolean }>) {
  const { data } = await api.patch<Gate>(`/gates/${id}`, input)
  return data
}

export async function deleteGate(id: string) {
  await api.delete(`/gates/${id}`)
}

export async function getGateLaneStaff() {
  const { data } = await api.get<GateLaneStaff[]>('/gate-lanes/staff')
  return data
}

export async function createGateLane(input: { name: string; vehicleType: GateVehicleType; gateId?: string | null; floorId?: number | null; cameraId?: string }) {
  const { data } = await api.post<GateLane>('/gate-lanes', input)
  return data
}

export async function updateGateLane(id: string, input: Partial<{ name: string; vehicleType: GateVehicleType; floorId: number | null; cameraId: string | null; isActive: boolean }>) {
  const { data } = await api.patch<GateLane>(`/gate-lanes/${id}`, input)
  return data
}

export async function assignGateLane(laneId: string, staffId: string) {
  const { data } = await api.post(`/gate-lanes/${laneId}/assignments`, { staffId })
  return data
}

export async function unassignGateLane(staffId: string) {
  await api.delete(`/gate-lanes/assignments/${staffId}`)
}

export async function deleteGateLane(id: string) {
  await api.delete(`/gate-lanes/${id}`)
}
