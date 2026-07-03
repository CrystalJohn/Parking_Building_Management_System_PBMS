import api from './api'

// ─── Types matching backend DTOs ─────────────────────────────────────────────

export type VehicleType = 'car' | 'motorbike'
export type Zone = 'A' | 'B'
export type SessionStatus = 'active' | 'checkout_pending' | 'exit_authorized' | 'completed' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired'
export type PaymentMethod = 'cash' | 'bank_qr'
export type CheckInIdentificationMethod = 'RESERVATION_QR' | 'OCR' | 'MANUAL_PLATE'
export type VehicleLookupMode = 'WALK_IN' | 'REGISTERED' | 'SUBSCRIBER'

export interface CheckInRequest {
  licensePlate: string
  vehicleType: VehicleType
  driverPhone?: string
  reservationId?: string
  reservationCode?: string
  ocrEvidenceId?: string
  identificationMethod?: CheckInIdentificationMethod
  identificationConfidence?: number
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
  ticket?: SessionTicket
}

export interface ReservationScanResponse {
  reservationId: string
  vehicleId: string
  plateNumber: string
  vehicleType: VehicleType
  slotId: number
  slotCode: string
  slotLabel: string
  driverName: string
  paymentBadge: 'Paid' | 'Auto-pay' | 'Pay on exit'
  expiresAt: string
  fallbackAction: 'USE_OCR_WALKIN'
}

export interface ConfirmReservationCheckInResponse {
  alreadyCheckedIn: boolean
  message: string
  session: {
    id: string
    reservationId: string | null
    vehicleId: string | null
    licensePlate: string
    vehicleType: VehicleType
    checkInTime: string
    status: SessionStatus
    sessionCode: string
  }
  slot: AssignedSlot
}

export interface SessionTicket {
  sessionId: string
  sessionCode: string
  qrPayload: string
  qrCode: string | null
  licensePlate: string
  vehicleType: VehicleType
  slotCode: string
  floorName?: string
  floorNumber?: number
  zone?: Zone
  checkInTime: string
  buildingName: string
  gateName: string
  ticketGeneratedAt: string
}

export interface OcrPlateBox {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
}

export interface OcrRecognizeResponse {
  ocrEvidenceId: string
  detectedPlate: string | null
  confidence: number | null
  vehicleTypePrediction: string | null
  provider: 'PLATE_RECOGNIZER'
  providerFilename: string | null
  providerTimestamp: string | null
  cameraId: string | null
  plateBox: OcrPlateBox | null
  buildingName: string
  gateName: string
  error: string | null
  durationMs: number
}

export interface VehicleLookupUser {
  id: string
  fullName: string | null
  phone: string
  email: string | null
  role: 'owner' | 'driver'
}

export interface VehicleLookupResponse {
  inputPlate: string
  normalizedPlate: string
  matched: boolean
  mode: VehicleLookupMode
  vehicle: {
    id: string
    plateNumber: string
    vehicleType: VehicleType
    isActive: boolean
    registeredAt: string
  } | null
  vehicleType: VehicleType | null
  owner: VehicleLookupUser | null
  ownerName: string | null
  driverCount: number
  linkedUsers: VehicleLookupUser[]
  subscription: {
    id: string
    planType: 'casual' | 'monthly' | 'yearly'
    validFrom: string
    validTo: string
    isActive: boolean
    isExpired: boolean
  } | null
  recentSessions: Array<{
    id: string
    licensePlate: string
    plateNumberOcr: string | null
    plateNumberConfirmed: string | null
    vehicleType: VehicleType
    status: SessionStatus
    checkInTime: string
    checkOutTime: string | null
    slot: {
      id: number
      code: string
      zone: Zone
      floor: FloorInfo
    }
  }>
}

export type GateCheckoutSubMode = 'PAYMENT_REQUIRED' | 'PAYMENT_PENDING' | 'READY_TO_EXIT'

export type GateScanResponse =
  | {
      mode: 'CHECK_IN'
      source: 'OCR' | 'MANUAL'
      plateOcr?: string | null
      plateConfirmed: string
      confidence?: number | null
      ocrEvidenceId?: string
      lookup: VehicleLookupResponse
    }
  | {
      mode: 'CHECK_OUT'
      source: 'OCR' | 'MANUAL'
      plateOcr?: string | null
      plateConfirmed: string
      confidence?: number | null
      ocrEvidenceId?: string
      subMode: GateCheckoutSubMode
      checkout: CheckoutWorkflowResponse
    }
  | {
      mode: 'NEEDS_MANUAL_PLATE'
      source: 'OCR'
      ocrEvidenceId?: string
      error?: string | null
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
  checkOutTime?: string
}

export interface CheckoutLookupInput {
  sessionCode?: string
  licensePlate?: string
}

export interface PaymentInfo {
  id: string
  sessionId: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  paidAt: string | null
  receivedBy?: string | null
  checkoutUrl?: string | null
  qrCode?: string | null
  expiredAt?: string | null
}

export interface CheckoutSessionInfo {
  id: string
  sessionCode: string
  licensePlate: string
  vehicleType: VehicleType
  checkInTime: string
  checkOutTime: string | null
  status: SessionStatus
  isPaid: boolean
  feeAmount: number
  penaltyAmount: number
  isOvertime: boolean
  isLostTicket: boolean
}

export interface CheckoutSlotInfo {
  id: number
  code: string
  status: 'available' | 'occupied' | 'reserved' | 'maintenance'
  zone: Zone
  floor: FloorInfo
}

export interface CheckoutWorkflowResponse {
  session: CheckoutSessionInfo
  slot: CheckoutSlotInfo
  fee: FeeBreakdown
  payment: PaymentInfo | null
}

export interface PaymentWorkflowResponse {
  session: CheckoutSessionInfo
  slot: CheckoutSlotInfo
  payment: PaymentInfo | null
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
  paymentId: string
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  exitAuthorizationStatus: SessionStatus
  paidAt: string
}

export interface ConfirmExitResponse {
  session: {
    id: string
    status: 'completed'
    checkOutTime: string
    checkedOutById: string
  }
  slot: {
    id: number
    code: string
    status: 'available'
  }
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

interface BackendLookupCheckoutResponse {
  session: CheckoutSessionInfo
  slot: CheckoutSlotInfo
  fee: FeeBreakdown
  payment: PaymentInfo | null
}

interface BackendCheckOutResponse {
  session: {
    id: string
    sessionCode: string
    licensePlate: string
    vehicleType: VehicleType
    checkInTime: string
    checkOutTime: string | null
    status: string
    driverId: string | null
    isPaid: boolean
    feeAmount: number
    penaltyAmount: number
    isOvertime: boolean
    isLostTicket: boolean
  }
  slot: {
    id: number
    code: string
    status: 'available' | 'occupied' | 'reserved' | 'maintenance'
    zone: Zone
    floor: FloorInfo
  }
  breakdown: BackendBreakdown
  payment: {
    id: string
    amount: number
    method: PaymentMethod
    status: PaymentStatus
    paidAt: string | null
    checkoutUrl?: string | null
    qrCode?: string | null
    expiredAt?: string | null
  }
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
      method: PaymentMethod
      status: PaymentStatus
      paidAt: string | null
    }
    exitAuthorizationStatus: SessionStatus
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
    checkOutTime: b.checkOutTime,
  }
}

function mapBackendCheckout(data: BackendCheckOutResponse): CheckoutWorkflowResponse {
  return {
    session: {
      id: data.session.id,
      sessionCode: data.session.sessionCode,
      licensePlate: data.session.licensePlate,
      vehicleType: data.session.vehicleType,
      checkInTime: data.session.checkInTime,
      checkOutTime: data.session.checkOutTime,
      status: data.session.status as SessionStatus,
      isPaid: data.session.isPaid,
      feeAmount: data.session.feeAmount,
      penaltyAmount: data.session.penaltyAmount,
      isOvertime: data.session.isOvertime,
      isLostTicket: data.session.isLostTicket,
    },
    slot: data.slot,
    fee: mapBreakdownToFee(data.breakdown),
    payment: {
      ...data.payment,
      sessionId: data.session.id,
    },
  }
}

// ─── API methods ─────────────────────────────────────────────────────────────

export async function checkIn(request: CheckInRequest): Promise<CheckInResponse> {
  const { data } = await api.post<CheckInResponse>('/checkin/confirm', request)
  return data
}

export async function scanReservationCheckIn(token: string): Promise<ReservationScanResponse> {
  const { data } = await api.post<ReservationScanResponse>('/checkin/scan-reservation', { token })
  return data
}

export async function confirmReservationCheckIn(
  reservationId: string,
): Promise<ConfirmReservationCheckInResponse> {
  const { data } = await api.post<ConfirmReservationCheckInResponse>(
    '/checkin/confirm-reservation',
    { reservationId },
  )
  return data
}

export async function lookupPlate(plateNumber: string): Promise<VehicleLookupResponse> {
  const { data } = await api.post<VehicleLookupResponse>('/vehicles/lookup-plate', {
    plateNumber,
  })
  return data
}

export async function recognizePlateImage(input: {
  image: Blob
  cameraId?: string
  buildingName?: string
  gateName?: string
  reservationId?: string
}): Promise<OcrRecognizeResponse> {
  const formData = new FormData()
  formData.append('image', input.image, 'gate-frame.jpg')
  if (input.cameraId) formData.append('cameraId', input.cameraId)
  if (input.buildingName) formData.append('buildingName', input.buildingName)
  if (input.gateName) formData.append('gateName', input.gateName)
  if (input.reservationId) formData.append('reservationId', input.reservationId)

  const { data } = await api.post<OcrRecognizeResponse>('/ocr/recognize', formData)
  return data
}

export async function scanGatePlate(input: {
  image: Blob
  cameraId?: string
  buildingName?: string
  gateName?: string
}): Promise<GateScanResponse> {
  const formData = new FormData()
  formData.append('image', input.image, 'gate-frame.jpg')
  if (input.cameraId) formData.append('cameraId', input.cameraId)
  if (input.buildingName) formData.append('buildingName', input.buildingName)
  if (input.gateName) formData.append('gateName', input.gateName)

  const { data } = await api.post<GateScanResponse>('/gate/scan-plate', formData)
  return data
}

export async function resolveGatePlate(input: {
  plate: string
  ocrEvidenceId?: string
}): Promise<Exclude<GateScanResponse, { mode: 'NEEDS_MANUAL_PLATE' }>> {
  const { data } = await api.post<Exclude<GateScanResponse, { mode: 'NEEDS_MANUAL_PLATE' }>>(
    '/gate/resolve-plate',
    input,
  )
  return data
}

export async function issueSessionTicket(sessionId: string) {
  const { data } = await api.post<{
    sessionId: string
    ticketIssuedAt: string
    ticketIssuedByStaffId: string
  }>(`/sessions/${sessionId}/ticket/issue`, {})
  return data
}

export async function lookupSessionForCheckout(input: CheckoutLookupInput): Promise<CheckoutWorkflowResponse> {
  const { data } = await api.get<BackendLookupCheckoutResponse>('/sessions/checkout-lookup', {
    params: {
      sessionCode: input.sessionCode || undefined,
      licensePlate: input.licensePlate || undefined,
    },
  })
  return data
}

export async function requestCheckout(input: CheckoutLookupInput): Promise<CheckoutWorkflowResponse> {
  const { data } = await api.post<BackendCheckOutResponse>('/sessions/check-out', {
    sessionId: input.sessionCode || undefined,
    licensePlate: input.licensePlate || undefined,
  })
  return mapBackendCheckout(data)
}

export async function checkOut(request: CheckOutRequest): Promise<CheckOutResponse> {
  const data = await requestCheckout({
    sessionCode: request.sessionId,
    licensePlate: request.licensePlate,
  })
  return {
    sessionId: data.session.id,
    licensePlate: data.session.licensePlate,
    vehicleType: data.session.vehicleType,
    checkInTime: data.session.checkInTime,
    checkOutTime: data.fee.checkOutTime ?? new Date().toISOString(),
    slotCode: data.slot.code,
    fee: data.fee,
    isPaid: data.session.isPaid,
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
    paymentId: r.payment.id,
    paymentMethod: r.payment.method,
    paymentStatus: r.payment.status,
    exitAuthorizationStatus: r.exitAuthorizationStatus,
    paidAt: r.payment.paidAt ?? r.checkOutTime,
  }
}

export async function confirmCashPayment(sessionId: string): Promise<ConfirmPaymentResponse> {
  return confirmPayment(sessionId)
}

export async function createBankQrPayment(sessionId: string): Promise<PaymentWorkflowResponse> {
  const { data } = await api.post<PaymentWorkflowResponse>(
    `/sessions/${sessionId}/payments/bank-qr`,
    {},
  )
  return data
}

export async function getPaymentStatus(sessionId: string): Promise<PaymentWorkflowResponse> {
  const { data } = await api.get<PaymentWorkflowResponse>(
    `/sessions/${sessionId}/payment-status`,
  )
  return data
}

export async function confirmExit(sessionId: string): Promise<ConfirmExitResponse> {
  const { data } = await api.post<ConfirmExitResponse>(
    `/sessions/${sessionId}/confirm-exit`,
    {},
  )
  return data
}

export async function confirmVehicleExited(sessionId: string): Promise<ConfirmExitResponse> {
  return confirmExit(sessionId)
}

export interface RecentSession {
  id: string
  sessionCode: string
  licensePlate: string
  vehicleType: VehicleType
  status: SessionStatus
  checkInTime: string
  checkOutTime: string | null
  slot: { code: string; zone: Zone; floor: string; floorNumber: number }
  payment: { method: PaymentMethod; status: PaymentStatus; amount: number } | null
  feeAmount: number
  penaltyAmount: number
}

export async function getRecentSessions(type: 'checkin' | 'checkout', limit = 20): Promise<RecentSession[]> {
  const { data } = await api.get<RecentSession[]>('/sessions/recent', {
    params: { type, limit },
  })
  return data
}

// ─── Manager slot inspection ──────────────────────────────────────────────────

export interface ActiveSessionDetail {
  id: string
  sessionCode: string
  licensePlate: string
  vehicleType: VehicleType
  checkInTime: string
  status: SessionStatus
  slotId: number
  slot: {
    id: number
    code: string
    zone: Zone
    floor: { id: number; floorNumber: number; name: string }
  }
  driver: { id: string; phone: string; fullName: string } | null
  feeAmount: number
  penaltyAmount: number
  isOvertime: boolean
}

export async function getActiveSessionBySlotId(slotId: number): Promise<ActiveSessionDetail | null> {
  const { data } = await api.get<ActiveSessionDetail[]>('/sessions/active')
  return data.find((s) => s.slotId === slotId) ?? null
}
