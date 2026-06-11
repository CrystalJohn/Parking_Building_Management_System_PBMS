import { IsOptional, IsString, IsUUID, IsIn } from 'class-validator';

/**
 * Identification methods supported for checkout.
 * Used for audit trail and operational analytics.
 */
export const CHECKOUT_IDENTIFICATION_METHODS = [
  'SESSION_QR',
  'MANUAL_SESSION_CODE',
  'LICENSE_PLATE',
  'OCR',
] as const;

export type CheckOutIdentificationMethod = (typeof CHECKOUT_IDENTIFICATION_METHODS)[number];

/**
 * 15.1: Check-out DTO.
 * Accepts either session_id (from QR scan / manual code) or license_plate — at least one required.
 * Req 2.1, 2.2
 */
export class CheckOutDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  licensePlate?: string;

  /**
   * P0-B: How the session was identified at checkout.
   * Enables audit trail and operational analytics.
   */
  @IsOptional()
  @IsIn(CHECKOUT_IDENTIFICATION_METHODS)
  identificationMethod?: CheckOutIdentificationMethod;

  /**
   * Custom validation: at least one of sessionId or licensePlate must be provided.
   * Handled at service level for clearer error messages.
   */
}
