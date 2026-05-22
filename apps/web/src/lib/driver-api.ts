import api from './api'

// ─── Types ───────────────────────────────────────────────────────────────────

export type VehicleType = 'car' | 'motorbike'
export type Zone = 'A' | 'B'
export type ReservationStatus = 'active' | 'fulfilled' | 'expired' | 'cancelled'
export type SessionStatus = 'active' | 'completed' | 'cancelled'

export interface FloorInfo {
  id: number
  floorNumber: number
  name: string
}

export interface SlotInfo {
  id: number
  code: string
  zone: Zone
  floor: FloorInfo
}

export interface AvailabilityItem {
  floorNumber: number
  floorName: string
  zone: Zone
  vehicleType: VehicleType
  total: number
  available: number
  occupied: number
  reserved: number
  maintenance: number
}

export interface PricingInfo {
  id: number
  vehicleType: VehicleType
  hourlyRate: number
  overtimePenalty: number
  lostTicketPenalty: number
  overtimeThresholdHours: number
}

export interface Reservation {
  id: string
  vehicleType: VehicleType
  status: ReservationStatus
  createdAt: string
  expiresAt: string
  slot: SlotInfo
}

export interface CreateReservationResponse {
  reservation: {
    id: string
    vehicleType: VehicleType
    status: ReservationStatus
    createdAt: string
    expiresAt: string
  }
  slot: SlotInfo
}

export interface ParkingSessionHistory {
  id: string
  licensePlate: string
  vehicleType: VehicleType
  checkInTime: string
  checkOutTime: string | null
  status: SessionStatus
  feeAmount: number
  penaltyAmount: number
  isPaid: boolean
  isOvertime: boolean
  isLostTicket: boolean
  slot: SlotInfo
}

export interface ActiveSession {
  id: string
  licensePlate: string
  vehicleType: VehicleType
  checkInTime: string
  status: 'active'
  qrCode: string | null
  slot: SlotInfo
}

// ─── API calls ───────────────────────────────────────────────────────────────

/** 23.1: Get slot availability by floor/zone */
export async function getAvailability(): Promise<AvailabilityItem[]> {
  const { data } = await api.get('/slots/availability')
  return data
}

/** 23.1: Get pricing config */
export async function getPricing(): Promise<PricingInfo[]> {
  const { data } = await api.get('/pricing')
  return data
}

/** 23.2: List my reservations */
export async function getMyReservations(): Promise<Reservation[]> {
  const { data } = await api.get('/reservations/my')
  return data
}

/** 23.2: Create a reservation */
export async function createReservation(vehicleType: VehicleType): Promise<CreateReservationResponse> {
  const { data } = await api.post('/reservations', { vehicleType })
  return data
}

/** 23.2: Cancel a reservation */
export async function cancelReservation(id: string): Promise<void> {
  await api.delete(`/reservations/${id}`)
}

/** 23.3: Get my session history */
export async function getMyHistory(): Promise<ParkingSessionHistory[]> {
  const { data } = await api.get('/sessions/my-history')
  return data
}

/** 23.4: Get my active session(s) */
export async function getMyActiveSessions(): Promise<ActiveSession[]> {
  const { data } = await api.get('/sessions/my-active')
  return data
}

/** 23.4: Get QR code for a session */
export async function getSessionQr(sessionId: string): Promise<{ sessionId: string; qrCode: string }> {
  const { data } = await api.get(`/sessions/${sessionId}/qr`)
  return data
}
