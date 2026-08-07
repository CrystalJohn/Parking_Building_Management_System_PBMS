import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { GateType } from '@prisma/client';

export class CreateGateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsEnum(GateType)
  gateType!: GateType;

  @IsOptional()
  @IsInt()
  floorId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cameraId?: string;
}

export class UpdateGateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(GateType)
  gateType?: GateType;

  @IsOptional()
  @IsInt()
  floorId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cameraId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
