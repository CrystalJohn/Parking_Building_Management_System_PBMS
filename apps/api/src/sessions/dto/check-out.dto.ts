import { IsOptional, IsString, IsIn } from 'class-validator';

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
  @IsString()
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
   * Exit lane used at check-out (e.g. car vs motorbike lane on the ground floor).
   * The building has no per-slot sensors; the checkout gate lane is the unit of exit.
   */
  @IsOptional()
  @IsString()
  gateLaneId?: string;
}
