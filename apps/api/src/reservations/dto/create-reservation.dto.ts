import { IsEnum, IsISO8601, IsNotEmpty } from 'class-validator';
import { VehicleType } from '@prisma/client';

/**
 * 18.1: Create reservation DTO.
 * Driver specifies vehicle type; slot is assigned by allocation service.
 * Req 8.1
 */
export class CreateReservationDto {
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsNotEmpty()
  @IsISO8601()
  plannedArrivalAt: string;
}
