import { IsInt, IsPositive, IsEnum, Min, Max } from 'class-validator';
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

  @IsInt()
  @Min(0)
  @Max(100)
  reservationDiscountPercent: number;
}
