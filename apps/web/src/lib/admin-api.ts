import api from './api'

export interface AdminSummary {
  users: {
    total: number
    active: number
    inactive: number
    byRole: Record<'admin' | 'manager' | 'staff' | 'driver', number>
  }
  slots: {
    total: number
    available: number
    reserved: number
    occupied: number
    occupancyRate: number
    byVehicleType: {
      car: SlotMetric
      motorbike: SlotMetric
    }
    byFloor: Array<SlotMetric & { floor: string | number; occupancyRate: number }>
    byZone: Array<SlotMetric & { floor: string | number; zone: string; occupancyRate: number }>
  }
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

export type AdminFlagSeverity = 'critical' | 'warning' | 'info'

export interface AdminOperationFlag {
  type: string
  severity: AdminFlagSeverity
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

export async function getAdminSummary() {
  const { data } = await api.get<AdminSummary>('/admin/summary')
  return data
}

export async function getAdminOperationsFlags() {
  const { data } = await api.get<AdminOperationsFlags>('/admin/operations/flags')
  return data
}

export async function getAdminPendingPayments() {
  const { data } = await api.get<AdminPendingPayments>('/admin/operations/pending-payments')
  return data
}
