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

// ─── Strategy Implementations ────────────────────────────────────────────────

/**
 * 31.2 / 12: Balanced Occupancy Strategy (default).
 *
 * Algorithm:
 * 1. Filter slots by zone (Zone A for car, Zone B for motorbike)
 * 2. Calculate occupancy rate per floor for the matching vehicle type
 * 3. Sort: lowest occupancy → lowest floor number → lowest slot number
 * 4. Return the first available slot
 */
export class BalancedOccupancyStrategy implements AllocationStrategy {
  readonly name = 'balanced_occupancy';

  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor } {
    const targetZone = vehicleType === VehicleType.car ? Zone.A : Zone.B;
    const candidates = availableSlots.filter(
      (s) => s.zone === targetZone && s.vehicleType === vehicleType,
    );

    if (candidates.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    const floorOccupancy = this.calculateFloorOccupancy(
      allSlots,
      vehicleType,
      targetZone,
    );

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
 * 31.2: Lowest Floor Strategy.
 *
 * Algorithm:
 * 1. Filter by zone
 * 2. Sort: lowest floor number → lowest slot number
 * 3. Return the first available slot (always fills lower floors first)
 *
 * Use case: Minimize walking distance for drivers (ground floor preferred).
 * Research: Baseline comparison for RQ2 (search time).
 */
export class LowestFloorStrategy implements AllocationStrategy {
  readonly name = 'lowest_floor';

  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    _allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor } {
    const targetZone = vehicleType === VehicleType.car ? Zone.A : Zone.B;
    const candidates = availableSlots.filter(
      (s) => s.zone === targetZone && s.vehicleType === vehicleType,
    );

    if (candidates.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    candidates.sort((a, b) => {
      if (a.floor.floorNumber !== b.floor.floorNumber)
        return a.floor.floorNumber - b.floor.floorNumber;
      return a.slotNumber - b.slotNumber;
    });

    return candidates[0];
  }
}

/**
 * 31.2: Random Strategy.
 *
 * Algorithm:
 * 1. Filter by zone
 * 2. Pick a random available slot
 *
 * Use case: Simulates "free choice" / no guidance scenario.
 * Research: Control group for RQ2 (what happens without smart allocation).
 */
export class RandomStrategy implements AllocationStrategy {
  readonly name = 'random';

  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    _allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor } {
    const targetZone = vehicleType === VehicleType.car ? Zone.A : Zone.B;
    const candidates = availableSlots.filter(
      (s) => s.zone === targetZone && s.vehicleType === vehicleType,
    );

    if (candidates.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  }
}

// ─── Allocation Service ──────────────────────────────────────────────────────

/**
 * Allocation Service — orchestrates slot assignment using the active strategy.
 *
 * 31.3: Reads active strategy from SystemConfig at runtime.
 * 31.4: Injected into SessionsService for check-in and reservations.
 */
export class FairDistanceBasedStrategy implements AllocationStrategy {
  readonly name = 'fair_distance_based';

  private readonly weights = {
    distance: 0.45,
    floorOccupancy: 0.25,
    zoneOccupancy: 0.15,
    fairness: 0.15,
  };

  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor } {
    const targetZone = vehicleType === VehicleType.car ? Zone.A : Zone.B;
    const candidates = availableSlots.filter(
      (s) =>
        s.status === SlotStatus.available &&
        s.zone === targetZone &&
        s.vehicleType === vehicleType,
    );

    if (candidates.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    const maxDistance = Math.max(
      ...candidates.map((slot) => this.getWalkingDistance(slot)),
      1,
    );
    const floorOccupancy = this.calculateFloorOccupancy(
      allSlots,
      vehicleType,
      targetZone,
    );
    const zoneOccupancy = this.calculateFloorZoneOccupancy(
      allSlots,
      vehicleType,
      targetZone,
    );
    const averageOccupancy =
      floorOccupancy.size > 0
        ? Array.from(floorOccupancy.values()).reduce((sum, rate) => sum + rate, 0) /
          floorOccupancy.size
        : 0;

    return candidates
      .map((slot) => {
        const distanceScore = this.getWalkingDistance(slot) / maxDistance;
        const floorOccupancyScore = floorOccupancy.get(slot.floorId) ?? 0;
        const zoneOccupancyScore =
          zoneOccupancy.get(this.getFloorZoneKey(slot.floorId, slot.zone)) ?? 0;
        const fairnessScore = Math.max(
          0,
          floorOccupancyScore - averageOccupancy,
        );
        const score =
          this.weights.distance * distanceScore +
          this.weights.floorOccupancy * floorOccupancyScore +
          this.weights.zoneOccupancy * zoneOccupancyScore +
          this.weights.fairness * fairnessScore;

        return { slot, score };
      })
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;

        const distanceDiff =
          this.getWalkingDistance(a.slot) - this.getWalkingDistance(b.slot);
        if (distanceDiff !== 0) return distanceDiff;

        if (a.slot.floor.floorNumber !== b.slot.floor.floorNumber) {
          return a.slot.floor.floorNumber - b.slot.floor.floorNumber;
        }

        return a.slot.slotNumber - b.slot.slotNumber;
      })[0].slot;
  }

  private getWalkingDistance(slot: Slot): number {
    return Math.max(0, slot.walkingDistance ?? 0);
  }

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
    for (const [key, stats] of floorStats) {
      occupancyMap.set(
        key,
        stats.total > 0 ? stats.occupied / stats.total : 0,
      );
    }

    return occupancyMap;
  }

  private calculateFloorZoneOccupancy(
    allSlots: (Slot & { floor: Floor })[],
    vehicleType: VehicleType,
    zone: Zone,
  ): Map<string, number> {
    const zoneStats = new Map<string, { total: number; occupied: number }>();

    for (const slot of allSlots) {
      if (slot.vehicleType !== vehicleType || slot.zone !== zone) continue;

      const key = this.getFloorZoneKey(slot.floorId, slot.zone);
      if (!zoneStats.has(key)) {
        zoneStats.set(key, { total: 0, occupied: 0 });
      }

      const stats = zoneStats.get(key)!;
      stats.total++;
      if (
        slot.status === SlotStatus.occupied ||
        slot.status === SlotStatus.reserved
      ) {
        stats.occupied++;
      }
    }

    const occupancyMap = new Map<string, number>();
    for (const [key, stats] of zoneStats) {
      occupancyMap.set(
        key,
        stats.total > 0 ? stats.occupied / stats.total : 0,
      );
    }

    return occupancyMap;
  }

  private getFloorZoneKey(floorId: number, zone: Zone): string {
    return `${floorId}:${zone}`;
  }
}

@Injectable()
export class AllocationService {
  private readonly strategies: Map<string, AllocationStrategy>;
  private readonly defaultStrategy: AllocationStrategy;

  constructor(private readonly prisma: PrismaService) {
    // 31.2: Register all available strategies
    const balanced = new BalancedOccupancyStrategy();
    const fairDistanceBased = new FairDistanceBasedStrategy();
    const lowestFloor = new LowestFloorStrategy();
    const random = new RandomStrategy();

    this.strategies = new Map<string, AllocationStrategy>([
      [balanced.name, balanced],
      [fairDistanceBased.name, fairDistanceBased],
      [lowestFloor.name, lowestFloor],
      [random.name, random],
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

    // 31.3: Resolve strategy from config or override
    const strategy = await this.resolveStrategy(strategyName);

    // Fetch all slots with floor info (needed for occupancy calculation)
    const allSlots = await this.prisma.slot.findMany({
      include: { floor: true },
    });

    // Filter available slots
    const availableSlots = allSlots.filter(
      (s) => s.status === SlotStatus.available,
    );

    // If no available slots at all for this vehicle type, throw immediately
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

    // Measure allocation time
    const allocationTimeMs = Math.round(performance.now() - startTime);

    return {
      slot,
      allocationStrategy: strategy.name,
      allocationTimeMs,
    };
  }

  /**
   * 31.3: Resolve the strategy to use. Priority:
   * 1. Explicit strategyName parameter (for simulation/testing)
   * 2. System config `active_allocation_strategy`
   * 3. Default (balanced_occupancy)
   */
  private async resolveStrategy(strategyName?: string): Promise<AllocationStrategy> {
    // Priority 1: explicit override
    if (strategyName && this.strategies.has(strategyName)) {
      return this.strategies.get(strategyName)!;
    }

    // Priority 2: read from SystemConfig
    const config = await this.prisma.systemConfig.findUnique({
      where: { configKey: 'active_allocation_strategy' },
    });

    if (config?.configValue && this.strategies.has(config.configValue)) {
      return this.strategies.get(config.configValue)!;
    }

    // Priority 3: default
    return this.defaultStrategy;
  }

  /**
   * Get the active strategy name from system config.
   */
  async getActiveStrategyName(): Promise<string> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { configKey: 'active_allocation_strategy' },
    });
    return config?.configValue ?? this.defaultStrategy.name;
  }

  /**
   * 31.3: List all available strategy names (for config UI).
   */
  getAvailableStrategies(): { name: string; description: string }[] {
    return [
      {
        name: 'balanced_occupancy',
        description: 'Cân bằng tải giữa các tầng (mặc định)',
      },
      {
        name: 'fair_distance_based',
        description:
          'Weighted score: walking distance, occupancy, and fairness penalty',
      },
      {
        name: 'lowest_floor',
        description: 'Ưu tiên tầng thấp nhất (giảm walking time)',
      },
      {
        name: 'random',
        description: 'Ngẫu nhiên (mô phỏng free-choice, control group)',
      },
    ];
  }
}
