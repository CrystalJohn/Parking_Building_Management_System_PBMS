import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { VehicleType } from '@prisma/client';

export class CreateGateLaneDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cameraId?: string;
}

export class UpdateGateLaneDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cameraId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignStaffGateLaneDto {
  @IsUUID()
  staffId!: string;
}
