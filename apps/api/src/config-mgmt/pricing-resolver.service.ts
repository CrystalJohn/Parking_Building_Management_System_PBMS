import { Injectable, NotFoundException } from '@nestjs/common';
import { VehicleType, RateTable, RateTableType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RateSegment {
  from: Date;
  to: Date;
  rateTable: Pick<RateTable, 'id' | 'type' | 'hourlyRate' | 'name' | 'priority'>;
  durationMs: number;
  durationHours: number;
  cost: number;
}

export interface SegmentedCostResult {
  vehicleType: VehicleType;
  checkIn: Date;
  checkOut: Date;
  totalDurationMs: number;
  totalDurationHours: number;
  totalCost: number;
  segments: RateSegment[];
}

@Injectable()
export class PricingResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * BR-04: Get the active rate table for a vehicle type at a given point in time.
   * EVENT with highest priority wins; falls back to DEFAULT.
   */
  async getActiveRate(
    vehicleType: VehicleType,
    at: Date = new Date(),
  ): Promise<RateTable> {
    // BR-03: query EVENT tables, highest priority first
    const eventRate = await this.prisma.rateTable.findFirst({
      where: {
        type: RateTableType.EVENT,
        vehicleType,
        isActive: true,
        effectiveFrom: { lte: at },
        effectiveTo: { gt: at },
      },
      orderBy: { priority: 'desc' },
    });

    if (eventRate) return eventRate;

    // BR-01: fallback to DEFAULT
    const defaultRate = await this.prisma.rateTable.findFirst({
      where: {
        type: RateTableType.DEFAULT,
        vehicleType,
        isActive: true,
      },
    });

    if (!defaultRate) {
      throw new NotFoundException(
        `No active rate table found for vehicle type: ${vehicleType}`,
      );
    }

    return defaultRate;
  }

  /**
   * BR-05: Calculate segmented cost when a parking session spans multiple rate periods.
   *
   * Algorithm:
   * 1. Collect all time boundaries: checkIn, checkOut, and all EVENT effectiveFrom/To
   *    that overlap [checkIn, checkOut].
   * 2. Sort boundaries, create segments [t1, t2).
   * 3. For each segment, look up the active rate table at t1.
   * 4. Sum: duration × hourlyRate per segment.
   */
  async calculateSegmentedCost(
    vehicleType: VehicleType,
    checkIn: Date,
    checkOut: Date,
  ): Promise<SegmentedCostResult> {
    // 1. Find all EVENT rate tables that overlap [checkIn, checkOut]
    const overlappingEvents = await this.prisma.rateTable.findMany({
      where: {
        type: RateTableType.EVENT,
        vehicleType,
        isActive: true,
        effectiveFrom: { lt: checkOut },
        effectiveTo: { gt: checkIn },
      },
      orderBy: { priority: 'desc' },
    });

    // 2. Build boundary points
    const boundaries = new Set<number>();
    boundaries.add(checkIn.getTime());
    boundaries.add(checkOut.getTime());

    for (const event of overlappingEvents) {
      if (event.effectiveFrom && event.effectiveFrom > checkIn && event.effectiveFrom < checkOut) {
        boundaries.add(event.effectiveFrom.getTime());
      }
      if (event.effectiveTo && event.effectiveTo > checkIn && event.effectiveTo < checkOut) {
        boundaries.add(event.effectiveTo.getTime());
      }
    }

    const sorted = Array.from(boundaries).sort((a, b) => a - b);

    // 3. Calculate cost per segment
    const segments: RateSegment[] = [];
    let totalCost = 0;
    let totalDurationMs = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const segFrom = new Date(sorted[i]);
      const segTo = new Date(sorted[i + 1]);
      const durationMs = segTo.getTime() - segFrom.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);

      const rateTable = await this.getActiveRate(vehicleType, segFrom);
      const cost = Math.ceil(durationHours) * rateTable.hourlyRate;

      segments.push({
        from: segFrom,
        to: segTo,
        rateTable: {
          id: rateTable.id,
          type: rateTable.type,
          hourlyRate: rateTable.hourlyRate,
          name: rateTable.name,
          priority: rateTable.priority,
        },
        durationMs,
        durationHours,
        cost,
      });

      totalCost += cost;
      totalDurationMs += durationMs;
    }

    return {
      vehicleType,
      checkIn,
      checkOut,
      totalDurationMs,
      totalDurationHours: totalDurationMs / (1000 * 60 * 60),
      totalCost,
      segments,
    };
  }
}
