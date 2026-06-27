import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { VehicleType } from '@prisma/client';

export class SlotAvailabilityQueryDto {
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsISO8601()
  plannedArrivalAt?: string;
}
