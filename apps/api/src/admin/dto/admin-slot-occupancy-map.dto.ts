export type SlotOccupancyMapRiskLevel = 'normal' | 'warning' | 'critical';
export type SlotOccupancyMapSlotStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';
export type SlotOccupancyMapSessionStatus = 'active' | 'checkout_pending' | 'exit_authorized';
export type SlotOccupancyMapZoneId = 'A' | 'B';

export interface SlotOccupancyMapThresholdsDto {
  /** Session duration (hours) that promotes to "critical" */
  longActiveSessionHours: 24;
  /** checkout_pending age (minutes) that promotes to "critical" */
  checkoutPendingMinutes: 30;
  /** exit_authorized age (minutes) that promotes to "critical" */
  exitAuthorizedMinutes: 10;
  /** Bank QR pending age (minutes) that promotes to "critical" */
  pendingBankQrMinutes: 15;
  /** Session duration (hours) that promotes to "warning" */
  warningActiveHours: 12;
}

export interface SlotOccupancyMapRiskDto {
  level: SlotOccupancyMapRiskLevel;
  reason: string | null;
}

export interface SlotOccupancyMapSessionDto {
  id: string;
  sessionCode: string;
  plate: string;
  checkInTime: string;
  /** Minutes since check-in, computed at generation time */
  durationMinutes: number;
  status: SlotOccupancyMapSessionStatus;
  thumbnailUrl: string | null;
}

export interface SlotOccupancyMapSlotDto {
  id: number;
  code: string;
  status: SlotOccupancyMapSlotStatus;
  vehicleType: 'car' | 'motorbike';
  /** Denormalized for frontend convenience */
  floorNumber: number;
  floorName: string;
  zone: SlotOccupancyMapZoneId;
  session: SlotOccupancyMapSessionDto | null;
  risk: SlotOccupancyMapRiskDto;
}

export interface SlotOccupancyMapZoneDto {
  zone: SlotOccupancyMapZoneId;
  slots: SlotOccupancyMapSlotDto[];
}

export interface SlotOccupancyMapFloorDto {
  floorNumber: number;
  floorName: string;
  zones: SlotOccupancyMapZoneDto[];
}

export interface AdminSlotOccupancyMapDto {
  /** ISO timestamp of when this response was generated */
  generatedAt: string;
  /** Expose thresholds so the frontend can label them without hardcoding */
  thresholds: SlotOccupancyMapThresholdsDto;
  floors: SlotOccupancyMapFloorDto[];
}
