import {
  IsEnum,
  IsInt,
  IsPositive,
  IsOptional,
  IsString,
  Min,
  Max,
  IsDateString,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { VehicleType } from '@prisma/client';

@ValidatorConstraint({ name: 'EffectiveRange', async: false })
class EffectiveRangeValidator implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const obj = args.object as Record<string, unknown>;
    const from = obj.effectiveFrom;
    const to = obj.effectiveTo;
    if (from && to && new Date(from as string) >= new Date(to as string)) {
      return false;
    }
    return true;
  }

  defaultMessage() {
    return 'effectiveFrom must be before effectiveTo';
  }
}

export class CreateRateTableDto {
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsInt()
  @IsPositive()
  hourlyRate!: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @Validate(EffectiveRangeValidator)
  _effectiveRange?: unknown;
}

export class UpdateRateTableDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  hourlyRate?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @Validate(EffectiveRangeValidator)
  _effectiveRange?: unknown;
}

export class ListRateTablesDto {
  @IsOptional()
  @IsEnum(['upcoming', 'active', 'expired', 'all'] as const)
  status?: 'upcoming' | 'active' | 'expired' | 'all';

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;
}
