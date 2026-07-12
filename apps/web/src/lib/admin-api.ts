import api from './api'

export interface AdminSummary {
  meta: {
    selectedDate: string
    timezone: string
    range: {
      start: string
      end: string
    }
  }
  todayStatus: {
    slots: SlotSummary
    openSessions: {
      active: number
      checkoutPending: number
      exitAuthorized: number
      total: number
    }
    pendingPayments: number
    paymentRisk: {
      normal: number
      warning: number
      critical: number
      total: number
    }
  }
  report: {
    checkIns: number
    checkOuts: number
    completedSessions: number
    paidPayments: number
    revenue: number
    revenueByMethod: {
      cash: number
      bankQr: number
    }
    revenueByProvider: {
      vnpay: number
    }
    reservationCheckIns: number
    expiredReservations: number
  }
  slots: SlotSummary
  sessions: {
    active: number
    checkoutPending: number
    exitAuthorized: number
    completedToday: number
  }
  reservations: {
    active: number
    fulfilledToday: number
    cancelledToday: number
    expiredToday: number
  }
  payments: {
    pending: number
    paidToday: number
    failedToday: number
    cancelledToday: number
    expiredToday: number
    revenueToday: number
    byMethod: {
      cash: number
      bankQr: number
    }
    byProvider: {
      vnpay: number
    }
  }
}

export interface SlotMetric {
  total: number
  available: number
  reserved: number
  occupied: number
}

export interface SlotSummary extends SlotMetric {
  occupancyRate: number
  byVehicleType: {
    car: SlotMetric
    motorbike: SlotMetric
  }
  byFloor: Array<SlotMetric & { floor: string | number; occupancyRate: number }>
  byZone: Array<SlotMetric & { floor: string | number; zone: string; occupancyRate: number }>
}

export type AdminFlagSeverity = 'critical' | 'warning' | 'info'

export interface AdminOperationFlag {
  type: string
  severity: AdminFlagSeverity
  sessionId: string | null
  sessionCode: string | null
  reservationCode: string | null
  paymentId: string | null
  plateNumber: string | null
  message: string
  createdAt: string
  ageMinutes: number
}

export interface AdminOperationsFlags {
  summary: {
    totalFlags: number
    critical: number
    warning: number
    info: number
  }
  thresholds: {
    longActiveSessionHours: 24
    checkoutPendingMinutes: 30
    exitAuthorizedMinutes: 10
    pendingBankQrMinutes: 15
  }
  flags: AdminOperationFlag[]
}

export type PaymentMonitoringRisk = 'normal' | 'warning' | 'critical'

export interface AdminPendingPaymentItem {
  paymentId: string
  sessionCode: string | null
  plateNumber: string | null
  responsibleStaff: {
    id: string | null
    name: string | null
    phone: string | null
    source:
      | 'payment_created_by'
      | 'checkout_started_by'
      | 'cash_confirmed_by'
      | 'checkin_staff'
      | 'unknown'
  }
  amount: number
  method: 'cash' | 'bank_qr'
  provider: string | null
  status: string
  sessionStatus: string | null
  slotCode: string | null
  floor: string | number | null
  zone: string | null
  waitingLabel: string
  locationLabel: string
  createdAt: string
  ageMinutes: number
  risk: PaymentMonitoringRisk
  reason: string
  recommendedAction: string
}

export interface AdminPendingPayments {
  summary: {
    total: number
    normal: number
    warning: number
    critical: number
    overdue: number
  }
  thresholds: {
    pendingBankQrMinutes: 15
  }
  items: AdminPendingPaymentItem[]
}

export async function getAdminSummary(date?: string) {
  const { data } = await api.get<AdminSummary>('/admin/summary', { params: { date } })
  return normalizeAdminSummary(data)
}

function normalizeAdminSummary(data: AdminSummary): AdminSummary {
  return {
    ...data,
    slots: data.slots ?? data.todayStatus.slots,
    sessions: data.sessions ?? {
      active: data.todayStatus.openSessions.active,
      checkoutPending: data.todayStatus.openSessions.checkoutPending,
      exitAuthorized: data.todayStatus.openSessions.exitAuthorized,
      completedToday: data.report.completedSessions,
    },
    reservations: data.reservations ?? {
      active: 0,
      fulfilledToday: data.report.reservationCheckIns,
      cancelledToday: 0,
      expiredToday: data.report.expiredReservations,
    },
    payments: data.payments ?? {
      pending: data.todayStatus.pendingPayments,
      paidToday: data.report.paidPayments,
      failedToday: 0,
      cancelledToday: 0,
      expiredToday: 0,
      revenueToday: data.report.revenue,
      byMethod: data.report.revenueByMethod,
      byProvider: data.report.revenueByProvider,
    },
  }
}

export interface AdminReservationAuditItem {
  id: string
  status: 'active' | 'fulfilled' | 'expired' | 'cancelled'
  driverName: string | null
  driverPhone: string | null
  plateNumber: string | null
  vehicleType: 'car' | 'motorbike' | null
  slotCode: string | null
  createdAt: string
  expiresAt: string | null
  fulfilledAt: string | null
  timeLeftMinutes: number | null
  fulfilledSessionCode: string | null
}

export interface AdminReservationAudit {
  meta: {
    selectedDate: string
    timezone: string
    range: {
      start: string
      end: string
    }
  }
  summary: {
    currentlyReserved: number
    expiringSoon: number
    expiredToday: number
    fulfilledToday: number
  }
  watchlist: AdminReservationAuditItem[]
}

export interface AdminSessionEvidenceItem {
  id: string
  eventType: 'check_in' | 'check_out'
  thumbnailUrl: string | null
  imageUrl: string | null
  ocrPlate: string | null
  confirmedPlate: string | null
  ocrConfidence: number | null
  capturedAt: string
  providerTimestamp: string | null
  staffName: string | null
  staffPhone: string | null
  imageStatus: 'available' | 'missing' | 'expired'
}

export interface AdminSessionEvidence {
  session: {
    id: string
    sessionCode: string
    licensePlate: string
    plateNumberConfirmed: string | null
    vehicleType: 'car' | 'motorbike'
    status: string
    checkInTime: string
    checkOutTime: string | null
    slotCode: string | null
  }
  checkInEvidence: AdminSessionEvidenceItem | null
  checkOutEvidence: AdminSessionEvidenceItem | null
}

export async function getAdminOperationsFlags() {
  const { data } = await api.get<AdminOperationsFlags>('/admin/operations/flags')
  return data
}

export async function getAdminPendingPayments() {
  const { data } = await api.get<AdminPendingPayments>('/admin/operations/pending-payments')
  return data
}

export async function getAdminReservationAudit(date?: string) {
  const { data } = await api.get<AdminReservationAudit>('/admin/reservations/audit', {
    params: { date },
  })
  return data
}

export async function getAdminSessionEvidence(sessionId: string) {
  const { data } = await api.get<AdminSessionEvidence>(`/admin/sessions/${sessionId}/evidence`)
  return data
}

// ─── Slot Occupancy Map ────────────────────────────────────────────────────

export type SlotOccupancyMapRiskLevel = 'normal' | 'warning' | 'critical'
export type SlotOccupancyMapSlotStatus = 'available' | 'occupied' | 'reserved' | 'maintenance'
export type SlotOccupancyMapSessionStatus = 'active' | 'checkout_pending' | 'exit_authorized'

export interface SlotOccupancyMapThresholds {
  longActiveSessionHours: 24
  checkoutPendingMinutes: 30
  exitAuthorizedMinutes: 10
  pendingBankQrMinutes: 15
  warningActiveHours: 12
}

export interface SlotOccupancyMapRisk {
  level: SlotOccupancyMapRiskLevel
  reason: string | null
}

export interface SlotOccupancyMapSession {
  id: string
  sessionCode: string
  plate: string
  checkInTime: string
  durationMinutes: number
  status: SlotOccupancyMapSessionStatus
  thumbnailUrl: string | null
}

export interface SlotOccupancyMapSlot {
  id: number
  code: string
  status: SlotOccupancyMapSlotStatus
  vehicleType: 'car' | 'motorbike'
  floorNumber: number
  floorName: string
  zone: 'A' | 'B'
  session: SlotOccupancyMapSession | null
  risk: SlotOccupancyMapRisk
}

export interface SlotOccupancyMapZone {
  zone: 'A' | 'B'
  slots: SlotOccupancyMapSlot[]
}

export interface SlotOccupancyMapFloor {
  floorNumber: number
  floorName: string
  zones: SlotOccupancyMapZone[]
}

export interface AdminSlotOccupancyMap {
  generatedAt: string
  thresholds: SlotOccupancyMapThresholds
  floors: SlotOccupancyMapFloor[]
}

export async function getAdminSlotOccupancyMap() {
  const { data } = await api.get<AdminSlotOccupancyMap>('/admin/operations/slot-occupancy-map')
  return data
}
