import { IsInt, IsPositive, IsEnum } from 'class-validator';
import { VehicleType } from '@prisma/client';

export class UpdatePricingDto {
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsInt()
  @IsPositive()
  hourlyRate: number;

  @IsInt()
  @IsPositive()
  overtimePenalty: number;

  @IsInt()
  @IsPositive()
  lostTicketPenalty: number;

  @IsInt()
  @IsPositive()
  overtimeThresholdHours: number;
}
