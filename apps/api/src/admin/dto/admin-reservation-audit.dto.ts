import type { ReservationStatus, VehicleType } from '@prisma/client';

export interface AdminReservationAuditItemDto {
  id: string;
  status: ReservationStatus;
  driverName: string | null;
  driverPhone: string | null;
  plateNumber: string | null;
  vehicleType: VehicleType | null;
  slotCode: string | null;
  createdAt: string;
  expiresAt: string | null;
  fulfilledAt: string | null;
  timeLeftMinutes: number | null;
  fulfilledSessionCode: string | null;
}

export interface AdminReservationAuditDto {
  meta: {
    selectedDate: string;
    timezone: 'Asia/Ho_Chi_Minh';
    range: {
      start: string;
      end: string;
    };
  };
  summary: {
    currentlyReserved: number;
    expiringSoon: number;
    expiredToday: number;
    fulfilledToday: number;
  };
  watchlist: AdminReservationAuditItemDto[];
}
