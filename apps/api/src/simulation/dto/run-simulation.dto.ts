import {
  IsInt,
  IsPositive,
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Hourly arrival multiplier entry.
 * hour: 0-23, multiplier: factor applied to base arrivalRatePerMinute.
 */
export class HourlyProfileEntry {
  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;

  @IsNumber()
  @Min(0)
  arrivalMultiplier: number;

  @IsNumber()
  @Min(0)
  departureMultiplier: number;
}

/**
 * 34.1 (upgraded): Simulation run request DTO.
 * Supports full-day mode with hourly profiles and check-out events.
 */
export class RunSimulationDto {
  /** Duration of simulation in minutes. Use 1440 for full 24h. */
  @IsInt()
  @IsPositive()
  @Max(1440)
  durationMinutes: number;

  /** Base average arrivals per minute (Poisson lambda). Modified by hourly profile. */
  @IsNumber()
  @IsPositive()
  arrivalRatePerMinute: number;

  /** Ratio of cars to total vehicles (0.0 to 1.0). E.g., 0.3 = 30% cars, 70% motorbikes. */
  @IsNumber()
  @Min(0)
  @Max(1)
  carMotorbikeRatio: number;

  /** Allocation strategy to test. */
  @IsString()
  strategy: string;

  /** Optional seed for reproducible results. */
  @IsOptional()
  @IsInt()
  seed?: number;

  /**
   * Enable full-day mode with time-varying arrival/departure rates.
   * When true, uses hourlyProfile (or default Vietnam office pattern).
   * When false, uses constant arrivalRatePerMinute (original behavior).
   */
  @IsOptional()
  @IsBoolean()
  fullDayMode?: boolean;

  /**
   * Mean parking duration in minutes (for check-out events).
   * Default: 240 (4 hours). Only used when fullDayMode=true.
   */
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(1440)
  meanParkingDurationMinutes?: number;

  /**
   * Custom hourly profile. If not provided and fullDayMode=true,
   * uses default Vietnam office parking pattern.
   * Array of 24 entries (one per hour).
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HourlyProfileEntry)
  hourlyProfile?: HourlyProfileEntry[];

  /**
   * Simulation start hour (0-23). Default: 0 (midnight).
   * Useful for starting at 6:00 for a realistic day.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  startHour?: number;
}
