export interface AdminSummaryDto {
  meta: {
    date: string;
    timezone: string;
    range: {
      start: string;
      end: string;
    };
  };
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
    /**
     * Building occupancy percentage, calculated as occupied / total slots
     * across the full building. Floor and zone rows use their own local
     * denominators.
     */
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
  /** Floor occupancy percentage, calculated as occupied / total slots on this floor. */
  occupancyRate: number;
}

export interface ZoneSlotMetricDto extends SlotMetricDto {
  floor: string | number;
  zone: string;
  /** Zone occupancy percentage, calculated as occupied / total slots in this zone. */
  occupancyRate: number;
}
