export interface AdminSummaryDto {
  users: {
    total: number;
    active: number;
    inactive: number;
    byRole: {
      admin: number;
      manager: number;
      staff: number;
      driver: number;
    };
  };
  slots: {
    total: number;
    available: number;
    reserved: number;
    occupied: number;
    occupancyRate: number;
    byVehicleType: {
      car: SlotMetricDto;
      motorbike: SlotMetricDto;
    };
    byFloor: FloorSlotMetricDto[];
    byZone: ZoneSlotMetricDto[];
  };
  sessions: {
    active: number;
    checkoutPending: number;
    exitAuthorized: number;
    completedToday: number;
  };
  reservations: {
    active: number;
    fulfilledToday: number;
    cancelledToday: number;
    expiredToday: number;
  };
  payments: {
    pending: number;
    paidToday: number;
    failedToday: number;
    cancelledToday: number;
    expiredToday: number;
    revenueToday: number;
    byMethod: {
      cash: number;
      bankQr: number;
    };
    byProvider: {
      vnpay: number;
    };
  };
}

export interface SlotMetricDto {
  total: number;
  available: number;
  reserved: number;
  occupied: number;
}

export interface FloorSlotMetricDto extends SlotMetricDto {
  floor: string | number;
  occupancyRate: number;
}

export interface ZoneSlotMetricDto extends SlotMetricDto {
  floor: string | number;
  zone: string;
  occupancyRate: number;
}
