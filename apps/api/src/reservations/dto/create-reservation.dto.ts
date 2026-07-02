import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

/**
 * Driver must choose one of their linked vehicles.
 * Backend derives vehicleType and plateNumber from the linked vehicle record.
 */
export class CreateReservationDto {
  @IsUUID()
  vehicleId: string;

  @IsOptional()
  @IsISO8601()
  plannedArrivalAt?: string;
}
