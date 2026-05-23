import { IsInt, IsPositive, IsEnum } from 'class-validator';
import { Zone } from '@prisma/client';

export class UpdateBuildingDto {
  @IsInt()
  @IsPositive()
  floors: number;

  @IsInt()
  @IsPositive()
  slotsPerFloorZoneA: number;

  @IsInt()
  @IsPositive()
  slotsPerFloorZoneB: number;
}
