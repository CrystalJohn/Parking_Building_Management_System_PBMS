import {
  IsString,
  IsEnum,
  IsOptional,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { VehicleType } from '@prisma/client';

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
}
