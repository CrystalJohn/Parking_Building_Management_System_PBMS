import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  Max,
  Matches,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { VehicleType } from '@prisma/client';

/**
 * Identification methods supported for check-in.
 * Used for audit trail and operational analytics.
 */
export const CHECKIN_IDENTIFICATION_METHODS = [
  'OCR',
  'MANUAL_PLATE',
  'RESERVATION_QR',
] as const;

export type CheckInIdentificationMethod = (typeof CHECKIN_IDENTIFICATION_METHODS)[number];

export class CheckInDto {
  /**
   * Vehicle license plate number.
   * Req 1.1
   */
  @IsString()
  @IsNotEmpty()
  licensePlate: string;

  /**
   * Vehicle type: car or motorbike.
   * Req 1.1
   */
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  /**
   * Optional phone number of a registered driver.
   * When provided, the session is linked to the driver account and a QR code is generated.
   * Req 1.2, 1.3
   */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{9,11}$/, { message: 'driverPhone must be a valid phone number' })
  driverPhone?: string;

  /**
   * P0-A: Optional reservation ID from scanning a reservation QR code.
   * When provided, the system directly looks up this reservation for fulfillment
   * instead of relying on driverPhone → DB lookup.
   */
  @IsOptional()
  @IsUUID()
  reservationId?: string;

  /**
   * P0-B: How the vehicle was identified at check-in.
   * Enables audit trail and operational analytics.
   */
  @IsOptional()
  @IsIn(CHECKIN_IDENTIFICATION_METHODS)
  identificationMethod?: CheckInIdentificationMethod;

  /**
   * P0-B: OCR confidence score (0..1) when identification was via OCR.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  identificationConfidence?: number;
}
