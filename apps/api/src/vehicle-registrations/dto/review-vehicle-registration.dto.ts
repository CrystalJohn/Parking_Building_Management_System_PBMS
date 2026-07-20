import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { VehicleRegistrationStatus } from '@prisma/client';

export class ReviewVehicleRegistrationDto {
  @IsEnum(VehicleRegistrationStatus)
  status: VehicleRegistrationStatus;

  @ValidateIf((o) => o.status === 'rejected')
  @IsString()
  @IsNotEmpty()
  rejectReason?: string;
}
