import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

/**
 * 15.1: Check-out DTO.
 * Accepts either session_id (from QR scan) or license_plate — at least one required.
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
   * Custom validation: at least one of sessionId or licensePlate must be provided.
   * Handled at service level for clearer error messages.
   */
}
