import api from './api'

// ─── Types ───────────────────────────────────────────────────────────────────

export type VehicleType = 'car' | 'motorbike'
export type Zone = 'A' | 'B'
export type ReservationStatus = 'active' | 'fulfilled' | 'expired' | 'cancelled'
export type SessionStatus = 'active' | 'checkout_pending' | 'exit_authorized' | 'completed' | 'cancelled'

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
  vehicleId?: string | null
  vehicleType: VehicleType
  status: ReservationStatus
  createdAt: string
  expiresAt: string
  licensePlate?: string | null
  vehicle?: {
    id: string
    plateNumber: string
    vehicleType: VehicleType
  } | null
  slot: SlotInfo | null
}

export interface ReservationCheckInQr {
  reservationId: string
  token: string
  issuedAt: string
  expiresAt: string
  refreshAfterMs: number
  vehicle: {
    id: string
    plateNumber: string
    vehicleType: VehicleType
  }
  slot: SlotInfo
}

export interface ReservationQuotaSnapshot {
  limit: number
  remaining: number
  windowResetAt: string
  cooldownUntil: string | null
}

export interface DriverVehicle {
  id: string
  plateNumber: string
  vehicleType: VehicleType
  isActive: boolean
  registeredAt: string
  linkedRole: 'owner' | 'driver'
  activeSubscription: {
    id: string
    planType: 'casual' | 'monthly' | 'yearly'
    validFrom: string
    validTo: string
  } | null
}

export interface VehicleRegistrationRequest {
  id: string
  plateNumber: string
  vehicleType: VehicleType
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  rejectReason: string | null
  createdAt: string
}

export interface CreateReservationResponse {
  quota: ReservationQuotaSnapshot
  reservation: {
    id: string
    vehicleId?: string | null
    vehicleType: VehicleType
    status: ReservationStatus
    createdAt: string
    expiresAt: string
    licensePlate?: string | null
  }
  slot: SlotInfo
}

export interface CancelReservationResponse {
  message: string
  quota: ReservationQuotaSnapshot
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
  status: Exclude<SessionStatus, 'completed' | 'cancelled'>
  qrCode: string | null
  slot: SlotInfo
}

export type SubscriptionPlanType = 'monthly' | 'yearly'
export type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled'

export interface SubscriptionInfo {
  id: string
  vehicleId: string
  plateNumber: string
  vehicleType: VehicleType
  planType: SubscriptionPlanType
  status: SubscriptionStatus
  validFrom: string | null
  validTo: string | null
  notes: string | null
  payment: {
    id: string
    status: string
    amount: number
    method: string | null
    paidAt: string | null
    checkoutUrl: string | null
    expiredAt: string | null
  } | null
  createdAt: string
}

export interface CreateSubscriptionResponse {
  id: string
  vehicleId: string
  vehicleType: VehicleType
  plateNumber: string
  planType: SubscriptionPlanType
  amount: number
  checkoutUrl: string
  qrCode: string | null
  expiredAt: string
  paymentId: string
  paymentStatus: string
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

export async function getMyVehicles(): Promise<DriverVehicle[]> {
  const { data } = await api.get('/vehicles/my')
  return data
}

export async function getMyVehicleRegistrationRequests(): Promise<VehicleRegistrationRequest[]> {
  const { data } = await api.get<VehicleRegistrationRequest[]>('/vehicle-registrations/my')
  return data
}

export async function createVehicleRegistrationRequest(plateNumber: string, vehicleType: VehicleType, evidence: File): Promise<VehicleRegistrationRequest> {
  const formData = new FormData()
  formData.append('plateNumber', plateNumber)
  formData.append('vehicleType', vehicleType)
  formData.append('evidence', evidence)

  const { data } = await api.post<VehicleRegistrationRequest>('/vehicle-registrations', formData)
  return data
}

export async function getReservationQuota(): Promise<ReservationQuotaSnapshot> {
  const { data } = await api.get<ReservationQuotaSnapshot>('/reservations/quota')
  return data
}

/** 23.2: Create a reservation */
export async function createReservation(vehicleId: string): Promise<CreateReservationResponse> {
  const { data } = await api.post('/reservations', { vehicleId })
  return data
}

/** 23.2: Cancel a reservation */
export async function cancelReservation(id: string): Promise<CancelReservationResponse> {
  const { data } = await api.delete<CancelReservationResponse>(`/reservations/${id}`)
  return data
}

export async function getReservationCheckInQr(id: string): Promise<ReservationCheckInQr> {
  const { data } = await api.get<ReservationCheckInQr>(`/reservations/${id}/checkin-qr`)
  return data
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

/** Create a subscription for a vehicle */
export async function createSubscription(vehicleId: string, planType: SubscriptionPlanType): Promise<CreateSubscriptionResponse> {
  const { data } = await api.post('/subscriptions', { vehicleId, planType })
  return data
}

/** List my subscriptions */
export async function getMySubscriptions(): Promise<SubscriptionInfo[]> {
  const { data } = await api.get('/subscriptions/my')
  return data
}

/** Get subscription payment status */
export async function getSubscriptionPaymentStatus(subscriptionId: string): Promise<{
  id: string
  planType: SubscriptionPlanType
  status: SubscriptionStatus
  validFrom: string | null
  validTo: string | null
  payment: {
    status: string
    paidAt: string | null
    method: string | null
    amount: number
    checkoutUrl: string | null
    expiredAt: string | null
  } | null
}> {
  const { data } = await api.get(`/subscriptions/${subscriptionId}/payment-status`)
  return data
}
