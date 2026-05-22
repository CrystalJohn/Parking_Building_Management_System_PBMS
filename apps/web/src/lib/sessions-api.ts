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

// ─── Check-out types ─────────────────────────────────────────────────────────

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

// ─── Backend raw response types (internal) ───────────────────────────────────

interface BackendBreakdown {
  sessionId: string
  vehicleType: VehicleType
  checkInTime: string
  checkOutTime: string
  durationMs: number
  durationHours: number
  roundedHours: number
  hourlyRate: number
  baseFee: number
  isOvertime: boolean
  overtimePenalty: number
  isLostTicket: boolean
  lostTicketPenalty: number
  totalFee: number
}

interface BackendCheckOutResponse {
  session: {
    id: string
    licensePlate: string
    vehicleType: VehicleType
    checkInTime: string
    status: string
    driverId: string | null
  }
  slot: {
    id: number
    code: string
    zone: Zone
    floor: FloorInfo
  }
  breakdown: BackendBreakdown
}

interface BackendConfirmPaymentResponse {
  receipt: {
    sessionId: string
    licensePlate: string
    vehicleType: VehicleType
    slot: { code: string; floor: string }
    checkInTime: string
    checkOutTime: string
    durationHours: number
    breakdown: {
      hourlyRate: number
      roundedHours: number
      baseFee: number
      isOvertime: boolean
      overtimePenalty: number
      isLostTicket: boolean
      lostTicketPenalty: number
      totalFee: number
    }
    payment: {
      id: string
      amount: number
      method: string
      paidAt: string
    }
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapBreakdownToFee(b: BackendBreakdown): FeeBreakdown {
  return {
    durationHours: b.roundedHours,
    baseFee: b.baseFee,
    penalty: b.overtimePenalty + b.lostTicketPenalty,
    total: b.totalFee,
    isOvertime: b.isOvertime,
    isLostTicket: b.isLostTicket,
  }
}

// ─── API methods ─────────────────────────────────────────────────────────────

export async function checkIn(request: CheckInRequest): Promise<CheckInResponse> {
  const { data } = await api.post<CheckInResponse>('/sessions/check-in', request)
  return data
}

export async function checkOut(request: CheckOutRequest): Promise<CheckOutResponse> {
  const { data } = await api.post<BackendCheckOutResponse>('/sessions/check-out', request)

  return {
    sessionId: data.session.id,
    licensePlate: data.session.licensePlate,
    vehicleType: data.session.vehicleType,
    checkInTime: data.breakdown.checkInTime,
    checkOutTime: data.breakdown.checkOutTime,
    slotCode: data.slot.code,
    fee: mapBreakdownToFee(data.breakdown),
    isPaid: false,
  }
}

export async function confirmPayment(sessionId: string): Promise<ConfirmPaymentResponse> {
  const { data } = await api.post<BackendConfirmPaymentResponse>(
    `/sessions/${sessionId}/confirm-payment`,
    {},
  )

  const r = data.receipt
  return {
    sessionId: r.sessionId,
    licensePlate: r.licensePlate,
    vehicleType: r.vehicleType,
    checkInTime: r.checkInTime,
    checkOutTime: r.checkOutTime,
    durationHours: r.durationHours,
    slotCode: r.slot.code,
    fee: {
      durationHours: r.breakdown.roundedHours,
      baseFee: r.breakdown.baseFee,
      penalty: r.breakdown.overtimePenalty + r.breakdown.lostTicketPenalty,
      total: r.breakdown.totalFee,
      isOvertime: r.breakdown.isOvertime,
      isLostTicket: r.breakdown.isLostTicket,
    },
    paymentMethod: 'cash',
    paidAt: r.payment.paidAt,
  }
}
