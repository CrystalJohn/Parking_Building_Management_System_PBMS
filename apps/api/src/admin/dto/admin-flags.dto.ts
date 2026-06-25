export type AdminFlagSeverity = 'critical' | 'warning' | 'info';

export interface AdminOperationsFlagsDto {
  summary: {
    totalFlags: number;
    critical: number;
    warning: number;
    info: number;
  };
  thresholds: {
    longActiveSessionHours: 24;
    checkoutPendingMinutes: 30;
    exitAuthorizedMinutes: 10;
    pendingBankQrMinutes: 15;
  };
  flags: AdminOperationFlagDto[];
}

export interface AdminOperationFlagDto {
  type: string;
  severity: AdminFlagSeverity;
  sessionCode: string | null;
  reservationCode: string | null;
  paymentId: string | null;
  plateNumber: string | null;
  message: string;
  createdAt: string;
  ageMinutes: number;
}
