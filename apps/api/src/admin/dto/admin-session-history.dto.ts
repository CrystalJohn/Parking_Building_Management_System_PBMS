import type { PaymentMethod, PaymentStatus, SessionStatus, VehicleType } from '@prisma/client';

export interface AdminSessionHistoryItemDto {
  id: string;
  sessionCode: string | null;
  status: SessionStatus;
  licensePlate: string;
  vehicleType: VehicleType;
  checkInTime: string;
  checkOutTime: string | null;
  durationMinutes: number | null;
  slotCode: string | null;
  floorName: string | null;
  isLostTicket: boolean;
  driverName: string | null;
  driverPhone: string | null;
  payment: {
    id: string;
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    paidAt: string | null;
  } | null;
}

export interface AdminSessionHistoryDto {
  meta: {
    selectedDate: string;
    timezone: 'Asia/Ho_Chi_Minh';
    range: {
      start: string;
      end: string;
    };
  };
  summary: {
    totalSessions: number;
    totalRevenue: number;
  };
  items: AdminSessionHistoryItemDto[];
}
