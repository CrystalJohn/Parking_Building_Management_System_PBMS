import { Injectable, ConflictException } from '@nestjs/common';
import {
  Floor,
  Prisma,
  Slot,
  SlotStatus,
  VehicleType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AllocationResult {
  slot: Slot & { floor: Floor };
  allocationStrategy: string;
  allocationTimeMs: number;
}

export interface CandidateSlotResult {
  candidateSlots: (Slot & { floor: Floor })[];
  allScoringSlots: (Slot & { floor: Floor })[];
  reservedCount: number;
  occupiedCount: number;
}

type PrismaLike = PrismaService | Prisma.TransactionClient;

export interface AllocationStrategy {
  readonly name: string;
  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor };
}

// 1. Floor-Based Allocation with Reservation Support - Thuật toán cân bằng tải
export class BalancedOccupancyStrategy implements AllocationStrategy {
  readonly name = 'balanced_occupancy';

  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor } {
    const candidates = availableSlots.filter(
      (slot) => slot.vehicleType === vehicleType,
    );

    if (candidates.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    const floorOccupancy = this.calculateFloorOccupancy(allSlots, vehicleType);

    candidates.sort((a, b) => {
      const occA = floorOccupancy.get(a.floorId) ?? 0;
      const occB = floorOccupancy.get(b.floorId) ?? 0;
      if (occA !== occB) return occA - occB;
      if (a.floor.floorNumber !== b.floor.floorNumber) {
        return a.floor.floorNumber - b.floor.floorNumber;
      }
      return a.slotNumber - b.slotNumber;
    });

    return candidates[0];
  }

  private calculateFloorOccupancy(
    allSlots: (Slot & { floor: Floor })[],
    vehicleType: VehicleType,
  ): Map<number, number> {
    const floorStats = new Map<number, { total: number; occupied: number }>();

    for (const slot of allSlots) {
      if (slot.vehicleType !== vehicleType) continue;

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

// 2. First-Come, First-Served (FCFS) Allocation - Thuật toán ưu tiên tầng thấp
export class LowestFloorStrategy implements AllocationStrategy {
  readonly name = 'lowest_floor';

  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    _allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor } {
    const candidates = availableSlots.filter(
      (slot) => slot.vehicleType === vehicleType,
    );

    if (candidates.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    candidates.sort((a, b) => {
      if (a.floor.floorNumber !== b.floor.floorNumber) {
        return a.floor.floorNumber - b.floor.floorNumber;
      }
      return a.slotNumber - b.slotNumber;
    });

    return candidates[0];
  }
}

export class RandomStrategy implements AllocationStrategy {
  readonly name = 'random';

  allocate(
    vehicleType: VehicleType,
    availableSlots: (Slot & { floor: Floor })[],
    _allSlots: (Slot & { floor: Floor })[],
  ): Slot & { floor: Floor } {
    const candidates = availableSlots.filter(
      (slot) => slot.vehicleType === vehicleType,
    );

    if (candidates.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}

// 4. Thuật toán phân bổ công bằng dựa trên khoảng cách di chuyển
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
    const candidates = availableSlots.filter(
      (slot) =>
        slot.status === SlotStatus.available &&
        slot.vehicleType === vehicleType,
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
    const floorOccupancy = this.calculateFloorOccupancy(allSlots, vehicleType);
    const zoneOccupancy = this.calculateFloorZoneOccupancy(allSlots, vehicleType);
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
  ): Map<number, number> {
    const floorStats = new Map<number, { total: number; occupied: number }>();

    for (const slot of allSlots) {
      if (slot.vehicleType !== vehicleType) continue;

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
  ): Map<string, number> {
    const zoneStats = new Map<string, { total: number; occupied: number }>();

    for (const slot of allSlots) {
      if (slot.vehicleType !== vehicleType) continue;

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

  private getFloorZoneKey(floorId: number, zone: string): string {
    return `${floorId}:${zone}`;
  }
}

@Injectable()
export class AllocationService {
  private readonly strategies: Map<string, AllocationStrategy>;
  private readonly defaultStrategy: AllocationStrategy;

  constructor(private readonly prisma: PrismaService) {
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

  async allocate(
    vehicleType: VehicleType,
    strategyName?: string,
    tx?: Prisma.TransactionClient,
    excludedSlotIds: ReadonlySet<number> = new Set<number>(),
  ): Promise<AllocationResult> {
    const startTime = performance.now();
    const strategy = await this.resolveStrategy(strategyName, tx);
    const { candidateSlots, allScoringSlots } = await this.getCandidateSlots(
      vehicleType,
      tx,
      excludedSlotIds,
    );

    if (candidateSlots.length === 0) {
      throw new ConflictException(
        `No available slot for vehicle type: ${vehicleType}`,
      );
    }

    const slot = strategy.allocate(vehicleType, candidateSlots, allScoringSlots);
    const allocationTimeMs = Math.round(performance.now() - startTime);

    return {
      slot,
      allocationStrategy: strategy.name,
      allocationTimeMs,
    };
  }

  /**
   * Final reservation model:
   * - slot.status is the current physical/hold state.
   * - `available` means free now, `reserved` means a 60-minute short-term hold,
   *   `occupied` means a vehicle is physically parked, and `maintenance` is closed.
   * - reservations are short-term holds only; no advance-booking overlap logic.
   *
   * This helper is the single source of truth for reservation availability and
   * allocation candidate selection.
   */
  async getCandidateSlots(
    vehicleType: VehicleType,
    tx?: Prisma.TransactionClient,
    excludedSlotIds: ReadonlySet<number> = new Set<number>(),
  ): Promise<CandidateSlotResult> {
    const client = tx ?? this.prisma;
    const [candidateSlots, heldOrOccupiedSlots] = await Promise.all([
      client.slot.findMany({
        where: {
          vehicleType,
          status: SlotStatus.available,
          id:
            excludedSlotIds.size > 0
              ? { notIn: Array.from(excludedSlotIds) }
              : undefined,
        },
        include: { floor: true },
        orderBy: [
          { floorId: 'asc' },
          { zone: 'asc' },
          { slotNumber: 'asc' },
        ],
      }),
      client.slot.findMany({
        where: {
          vehicleType,
          status: { in: [SlotStatus.occupied, SlotStatus.reserved] },
        },
        include: { floor: true },
        orderBy: [
          { floorId: 'asc' },
          { zone: 'asc' },
          { slotNumber: 'asc' },
        ],
      }),
    ]);

    return {
      candidateSlots,
      allScoringSlots: [...candidateSlots, ...heldOrOccupiedSlots],
      reservedCount: heldOrOccupiedSlots.filter(
        (slot) => slot.status === SlotStatus.reserved,
      ).length,
      occupiedCount: heldOrOccupiedSlots.filter(
        (slot) => slot.status === SlotStatus.occupied,
      ).length,
    };
  }

  private async resolveStrategy(
    strategyName?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AllocationStrategy> {
    if (strategyName && this.strategies.has(strategyName)) {
      return this.strategies.get(strategyName)!;
    }

    const client = tx ?? this.prisma;
    const config = await client.systemConfig.findUnique({
      where: { configKey: 'active_allocation_strategy' },
    });

    if (config?.configValue && this.strategies.has(config.configValue)) {
      return this.strategies.get(config.configValue)!;
    }

    return this.defaultStrategy;
  }

  async getActiveStrategyName(): Promise<string> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { configKey: 'active_allocation_strategy' },
    });
    return config?.configValue ?? this.defaultStrategy.name;
  }

  getAvailableStrategies(): { name: string; description: string }[] {
    return [
      {
        name: 'balanced_occupancy',
        description: 'Balance load between floors',
      },
      {
        name: 'fair_distance_based',
        description:
          'Weighted score: walking distance, occupancy, and fairness penalty',
      },
      {
        name: 'lowest_floor',
        description: 'Prefer the lowest floor',
      },
      {
        name: 'random',
        description: 'Random assignment for simulation/control scenarios',
      },
    ];
  }
}
