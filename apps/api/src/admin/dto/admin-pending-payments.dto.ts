import { PaymentMethod } from '@prisma/client';

export type PaymentMonitoringRisk = 'normal' | 'warning' | 'critical';

export interface AdminPendingPaymentsDto {
  summary: {
    total: number;
    normal: number;
    warning: number;
    critical: number;
    overdue: number;
  };
  thresholds: {
    pendingBankQrMinutes: 15;
  };
  items: AdminPendingPaymentItemDto[];
}

export interface AdminPendingPaymentItemDto {
  paymentId: string;
  sessionCode: string | null;
  plateNumber: string | null;
  responsibleStaff: {
    id: string | null;
    name: string | null;
    phone: string | null;
    source:
      | 'payment_created_by'
      | 'checkout_started_by'
      | 'cash_confirmed_by'
      | 'checkin_staff'
      | 'unknown';
  };
  amount: number;
  method: PaymentMethod;
  provider: string | null;
  status: string;
  sessionStatus: string | null;
  slotCode: string | null;
  floor: string | number | null;
  zone: string | null;
  waitingLabel: string;
  locationLabel: string;
  createdAt: string;
  ageMinutes: number;
  risk: PaymentMonitoringRisk;
  reason: string;
  recommendedAction: string;
}
