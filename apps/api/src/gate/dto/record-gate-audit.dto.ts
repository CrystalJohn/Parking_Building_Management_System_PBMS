import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const VIETNAMESE_PLATE_REGEX = /^(?:\d{2}[A-Z]\d{5}|\d{2}[A-Z]\d\d{5})$/;

export class RecordGateAuditDto {
  @IsString()
  @IsNotEmpty()
  @Matches(VIETNAMESE_PLATE_REGEX, {
    message: 'License plate must be 7-9 alphanumeric characters: province code (2 digits) + series (1-2 letters/digits) + 5 digits. Example: 30A12345',
  })
  canonicalPlate: string;

  @IsIn(['ACTIVE_SESSION', 'ACTIVE_RESERVATION', 'UNKNOWN'])
  vehicleStatus: string;

  @IsIn(['CHECKOUT', 'CHECKIN', 'MANUAL_REVIEW'])
  recommendedAction: string;

  @IsIn(['CHECKOUT', 'CHECKIN', 'MANUAL_REVIEW'])
  actualAction: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  reservationId?: string;

  @IsString()
  @IsNotEmpty()
  plateDisplay: string;
}
