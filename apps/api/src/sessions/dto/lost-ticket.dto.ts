import { IsString, IsNotEmpty } from 'class-validator';

/**
 * 24.1: Lost ticket DTO.
 * Staff verifies driver identity before processing lost ticket.
 * Req 5.6, 7.3
 */
export class LostTicketDto {
  @IsString()
  @IsNotEmpty()
  licensePlate: string;

  @IsString()
  @IsNotEmpty()
  idCardNo: string;

  @IsString()
  @IsNotEmpty()
  driverLicenseNo: string;
}
