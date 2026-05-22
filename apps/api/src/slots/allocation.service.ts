import { Injectable, ConflictException } from '@nestjs/common';
import { VehicleType, Zone, SlotStatus, Slot, Floor } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Result returned by the allocation service.
 */
export interface AllocationResult {
  slot: Slot & { floor: Floor };
  allocationStrategy: string;
  allocationTimeMs: number;
}

/**
 * Strategy interface for slot allocation algorithms.
 * Allows plugging in different strategies (Req 3, Design ref: Allocation Strategy Pattern).
 */
export interface AllocationStrategy {
  readonly name: string;
  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor };
}

/**
 * Default strategy: Balanced Occupancy (greedy by occupancy).
 *
 * Algorithm (Req 3.1–3.5):
 * 1. Filter slots by zone (Zone A for car, Zone B for motorbike)
 * 2. Calculate occupancy rate per floor for the matching vehicle type
 * 3. Sort: lowest occupancy → lowest floor number → lowest slot number
 * 4. Return the first available slot matching the criteria
 */
export class BalancedOccupancyStrategy implements AllocationStrategy {
  readonly name = 'balanced_occupancy';

  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor } {
    // 12.4: Filter by zone — Zone A for car, Zone B for motorbike
    const targetZone = vehicleType === VehicleType.car ? Zone.A : Zone.B;
    const candidates = availableSlots.filter(
      (s) => s.zone === targetZone && s.vehicleType === vehicleType,
    );

    if (candidates.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    // 12.2: Calculate occupancy rate per floor for this vehicle type + zone
    const floorOccupancy = this.calculateFloorOccupancy(
      allSlots,
      vehicleType,
      targetZone,
    );

    // 12.3: Sort candidates by floor occupancy (lowest first),
    // then floor number (lowest first), then slot number (lowest first)
    candidates.sort((a, b) => {
      const occA = floorOccupancy.get(a.floorId) ?? 0;
      const occB = floorOccupancy.get(b.floorId) ?? 0;
      if (occA !== occB) return occA - occB;
      if (a.floor.floorNumber !== b.floor.floorNumber)
        return a.floor.floorNumber - b.floor.floorNumber;
      return a.slotNumber - b.slotNumber;
    });

    return candidates[0];
  }

  /**
   * 12.2: Compute occupancy rate for each floor.
   * occupancy = occupied_count / total_count for the given vehicleType + zone.
   */
  private calculateFloorOccupancy(
    allSlots: (Slot & { floor: Floor })[],
    vehicleType: VehicleType,
    zone: Zone,
  ): Map<number, number> {
    const floorStats = new Map<number, { total: number; occupied: number }>();

    for (const slot of allSlots) {
      if (slot.vehicleType !== vehicleType || slot.zone !== zone) continue;

      if (!floorStats.has(slot.floorId)) {
        floorStats.set(slot.floorId, { total: 0, occupied: 0 });
      }
      const stats = floorStats.get(slot.floorId)!;
      stats.total++;
      if (
        slot.status === SlotStatus.occupied ||
        slot.status === SlotStatus.reserved
      ) {
        stats.occupied++;
      }
    }

    const occupancyMap = new Map<number, number>();
    for (const [floorId, stats] of floorStats) {
      occupancyMap.set(
        floorId,
        stats.total > 0 ? stats.occupied / stats.total : 0,
      );
    }

    return occupancyMap;
  }
}

/**
 * Allocation Service — orchestrates slot assignment using the active strategy.
 *
 * Responsibilities:
 * - Load available slots from DB
 * - Delegate to the active AllocationStrategy
 * - Measure allocation_time_ms (12.6)
 * - Throw ConflictException when building is full (12.5 / Req 1.5)
 */
@Injectable()
export class AllocationService {
  private readonly strategies: Map<string, AllocationStrategy>;
  private readonly defaultStrategy: AllocationStrategy;

  constructor(private readonly prisma: PrismaService) {
    // Register available strategies
    const balanced = new BalancedOccupancyStrategy();
    this.strategies = new Map<string, AllocationStrategy>([
      [balanced.name, balanced],
    ]);
    this.defaultStrategy = balanced;
  }

  /**
   * Allocate a slot for the given vehicle type using the active strategy.
   *
   * @param vehicleType - car or motorbike
   * @param strategyName - optional override; defaults to system config value
   * @returns AllocationResult with the assigned slot, strategy name, and timing
   * @throws ConflictException if no slot is available (Req 1.5)
   */
  async allocate(
    vehicleType: VehicleType,
    strategyName?: string,
  ): Promise<AllocationResult> {
    const startTime = performance.now();

    // Resolve strategy
    const strategy = this.resolveStrategy(strategyName);

    // Fetch all slots with floor info (needed for occupancy calculation)
    const allSlots = await this.prisma.slot.findMany({
      include: { floor: true },
    });

    // Filter available slots
    const availableSlots = allSlots.filter(
      (s) => s.status === SlotStatus.available,
    );

    // 12.5: If no available slots at all for this vehicle type, throw immediately
    const targetZone = vehicleType === VehicleType.car ? Zone.A : Zone.B;
    const hasAny = availableSlots.some(
      (s) => s.zone === targetZone && s.vehicleType === vehicleType,
    );
    if (!hasAny) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    // Delegate to strategy
    const slot = strategy.allocate(vehicleType, availableSlots, allSlots);

    // 12.6: Measure allocation time
    const allocationTimeMs = Math.round(performance.now() - startTime);

    return {
      slot,
      allocationStrategy: strategy.name,
      allocationTimeMs,
    };
  }

  /**
   * Resolve the strategy to use. Priority:
   * 1. Explicit strategyName parameter
   * 2. System config `active_allocation_strategy`
   * 3. Default (balanced_occupancy)
   */
  private resolveStrategy(strategyName?: string): AllocationStrategy {
    if (strategyName && this.strategies.has(strategyName)) {
      return this.strategies.get(strategyName)!;
    }
    // For now, return default. In Sprint 4 (task 31), this will read from SystemConfig.
    return this.defaultStrategy;
  }

  /**
   * Get the active strategy name from system config.
   * Used externally to log which strategy was active at allocation time.
   */
  async getActiveStrategyName(): Promise<string> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { configKey: 'active_allocation_strategy' },
    });
    return config?.configValue ?? this.defaultStrategy.name;
  }
}
