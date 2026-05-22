import api from './api'

// ─── Types matching backend DTOs ─────────────────────────────────────────────

export type VehicleType = 'car' | 'motorbike'
export type Zone = 'A' | 'B'
export type SessionStatus = 'active' | 'completed' | 'cancelled'

export interface CheckInRequest {
  licensePlate: string
  vehicleType: VehicleType
  driverPhone?: string
}

export interface FloorInfo {
  id: number
  floorNumber: number
  name: string
}

export interface AssignedSlot {
  id: number
  code: string
  zone: Zone
  floor: FloorInfo
}

export interface SessionSummary {
  id: string
  licensePlate: string
  vehicleType: VehicleType
  checkInTime: string
  status: SessionStatus
  allocationStrategy: string | null
  allocationTimeMs: number | null
}

export interface CheckInResponse {
  session: SessionSummary
  slot: AssignedSlot
  qr_code: string | null
}

// Check-out (task 15 — backend not implemented yet)
export interface CheckOutRequest {
  sessionId?: string
  licensePlate?: string
}

export interface FeeBreakdown {
  durationHours: number
  baseFee: number
  penalty: number
  total: number
  isOvertime: boolean
  isLostTicket: boolean
}

export interface CheckOutResponse {
  sessionId: string
  licensePlate: string
  vehicleType: VehicleType
  checkInTime: string
  checkOutTime: string
  slotCode: string
  fee: FeeBreakdown
  isPaid: boolean
}

export interface ConfirmPaymentResponse {
  sessionId: string
  licensePlate: string
  vehicleType: VehicleType
  checkInTime: string
  checkOutTime: string
  durationHours: number
  slotCode: string
  fee: FeeBreakdown
  paymentMethod: 'cash'
  paidAt: string
}

// ─── API methods ─────────────────────────────────────────────────────────────

export async function checkIn(request: CheckInRequest): Promise<CheckInResponse> {
  const { data } = await api.post<CheckInResponse>('/sessions/check-in', request)
  return data
}

export async function checkOut(request: CheckOutRequest): Promise<CheckOutResponse> {
  const { data } = await api.post<CheckOutResponse>('/sessions/check-out', request)
  return data
}

export async function confirmPayment(sessionId: string): Promise<ConfirmPaymentResponse> {
  const { data } = await api.post<ConfirmPaymentResponse>(
    `/sessions/${sessionId}/confirm-payment`,
  )
  return data
}
