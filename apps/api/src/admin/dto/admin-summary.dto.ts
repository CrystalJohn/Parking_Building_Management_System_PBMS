export interface AdminSummaryDto {
  meta: {
    selectedDate: string;
    timezone: string;
    range: {
      start: string;
      end: string;
    };
  };
  todayStatus: {
    slots: SlotSummaryDto;
    openSessions: {
      active: number;
      checkoutPending: number;
      exitAuthorized: number;
      total: number;
    };
    pendingPayments: number;
    paymentRisk: {
      normal: number;
      warning: number;
      critical: number;
      total: number;
    };
  };
  report: {
    checkIns: number;
    checkOuts: number;
    completedSessions: number;
    paidPayments: number;
    revenue: number;
    revenueByMethod: {
      cash: number;
      bankQr: number;
    };
    revenueByProvider: {
      vnpay: number;
    };
    reservationCheckIns: number;
    expiredReservations: number;
    activeReservations: number;
    cancelledToday: number;
  };
}

export interface SlotSummaryDto extends SlotMetricDto {
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
