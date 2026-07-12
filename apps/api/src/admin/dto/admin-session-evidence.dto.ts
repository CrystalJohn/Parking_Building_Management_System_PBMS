export type AdminEvidenceImageStatus = 'available' | 'missing' | 'expired';

export interface AdminSessionEvidenceItemDto {
  id: string;
  eventType: 'check_in' | 'check_out';
  thumbnailUrl: string | null;
  imageUrl: string | null;
  ocrPlate: string | null;
  confirmedPlate: string | null;
  ocrConfidence: number | null;
  capturedAt: string;
  providerTimestamp: string | null;
  staffName: string | null;
  staffPhone: string | null;
  imageStatus: AdminEvidenceImageStatus;
}

export interface AdminSessionEvidenceDto {
  session: {
    id: string;
    sessionCode: string;
    licensePlate: string;
    plateNumberConfirmed: string | null;
    vehicleType: 'car' | 'motorbike';
    status: string;
    checkInTime: string;
    checkOutTime: string | null;
    slotCode: string | null;
  };
  checkInEvidence: AdminSessionEvidenceItemDto | null;
  checkOutEvidence: AdminSessionEvidenceItemDto | null;
}
