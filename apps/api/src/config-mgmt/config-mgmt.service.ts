import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { VehicleType, RateTableType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdatePricingDto,
  UpdateBuildingDto,
  CreateRateTableDto,
  UpdateRateTableDto,
  ListRateTablesDto,
} from './dto';

@Injectable()
export class ConfigMgmtService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 29.1: Pricing Config ──────────────────────────────────────────────────

  /**
   * GET /config/pricing — return all pricing configs.
   * Req 10.2
   */
  async getPricing() {
    return this.prisma.pricingConfig.findMany({
      orderBy: { vehicleType: 'asc' },
    });
  }

  /**
   * PUT /config/pricing — update pricing for a vehicle type.
   * Req 10.4
   */
  async updatePricing(dto: UpdatePricingDto, userId: string) {
    const existing = await this.prisma.pricingConfig.findFirst({
      where: { vehicleType: dto.vehicleType },
    });

    if (!existing) {
      throw new NotFoundException(
        `PricingConfig not found for vehicle type: ${dto.vehicleType}`,
      );
    }

    return this.prisma.pricingConfig.update({
      where: { id: existing.id },
      data: {
        overtimePenalty: dto.overtimePenalty,
        lostTicketPenalty: dto.lostTicketPenalty,
        overtimeThresholdHours: dto.overtimeThresholdHours,
        reservationDiscountPercent: dto.reservationDiscountPercent,
        updatedBy: userId,
      },
    });
  }

  // ─── RateTable CRUD (BR-01 to BR-04) ────────────────────────────────────

  /**
   * GET /config/pricing/events — list rate tables with optional status filter.
   */
  async getRateTables(query: ListRateTablesDto) {
    const now = new Date();
    const where: Record<string, unknown> = { isActive: true };

    if (query.vehicleType) {
      where.vehicleType = query.vehicleType;
    }

    if (query.status === 'upcoming') {
      where.effectiveFrom = { gt: now };
    } else if (query.status === 'active') {
      where.effectiveFrom = { lte: now };
      where.effectiveTo = { gte: now };
    } else if (query.status === 'expired') {
      where.effectiveTo = { lt: now };
    }
    // 'all' or undefined → no time filter

    return this.prisma.rateTable.findMany({
      where,
      orderBy: [{ vehicleType: 'asc' }, { priority: 'desc' }, { effectiveFrom: 'asc' }],
    });
  }

  /**
   * BR-04: Get the active rate table for a vehicle type at a given time.
   * Falls back to DEFAULT if no EVENT is active.
   */
  async getActiveRate(vehicleType: VehicleType, at: Date = new Date()) {
    const eventRate = await this.prisma.rateTable.findFirst({
      where: {
        type: RateTableType.EVENT,
        vehicleType,
        isActive: true,
        effectiveFrom: { lte: at },
        effectiveTo: { gte: at },
      },
      orderBy: { priority: 'desc' },
    });

    if (eventRate) return eventRate;

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
   * POST /config/pricing/events — create an EVENT rate table.
   * BR-03: Prevents overlapping same-priority events.
   */
  async createRateTable(dto: CreateRateTableDto, userId: string) {
    // Endpoint only creates EVENT rate tables — DEFAULT is created via migration/seed

    // Check overlap with same priority
    if (dto.effectiveFrom && dto.effectiveTo) {
      const from = new Date(dto.effectiveFrom);
      const to = new Date(dto.effectiveTo);

      if (from >= to) {
        throw new BadRequestException('effectiveFrom must be before effectiveTo');
      }

      const priority = dto.priority ?? 0;
      const overlapping = await this.prisma.rateTable.findFirst({
        where: {
          type: RateTableType.EVENT,
          vehicleType: dto.vehicleType,
          isActive: true,
          priority,
          effectiveFrom: { lt: to },
          effectiveTo: { gt: from },
        },
      });

      if (overlapping) {
        throw new ConflictException(
          `Event rate table "${overlapping.name}" (priority ${priority}) overlaps with the requested time range`,
        );
      }
    }

    return this.prisma.rateTable.create({
      data: {
        type: RateTableType.EVENT,
        vehicleType: dto.vehicleType,
        hourlyRate: dto.hourlyRate,
        name: dto.name ?? `Event ${dto.vehicleType}`,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        priority: dto.priority ?? 0,
        createdBy: userId,
      },
    });
  }

  /**
   * PATCH /config/pricing/events/:id — update an EVENT rate table.
   * BR-03: Re-checks overlap on time/priority change.
   */
  async updateRateTable(id: string, dto: UpdateRateTableDto) {
    const existing = await this.prisma.rateTable.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`RateTable not found: ${id}`);
    }

    if (existing.type === RateTableType.DEFAULT) {
      throw new BadRequestException('Cannot update DEFAULT rate table via this endpoint');
    }

    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : existing.effectiveFrom;
    const effectiveTo = dto.effectiveTo
      ? new Date(dto.effectiveTo)
      : existing.effectiveTo;
    const priority = dto.priority ?? existing.priority;

    if (effectiveFrom && effectiveTo && effectiveFrom >= effectiveTo) {
      throw new BadRequestException('effectiveFrom must be before effectiveTo');
    }

    // Check overlap with other EVENT rate tables
    if (effectiveFrom && effectiveTo) {
      const overlapping = await this.prisma.rateTable.findFirst({
        where: {
          id: { not: id },
          type: RateTableType.EVENT,
          vehicleType: existing.vehicleType,
          isActive: true,
          priority,
          effectiveFrom: { lt: effectiveTo },
          effectiveTo: { gt: effectiveFrom },
        },
      });

      if (overlapping) {
        throw new ConflictException(
          `Event rate table "${overlapping.name}" (priority ${priority}) overlaps with the updated time range`,
        );
      }
    }

    return this.prisma.rateTable.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.hourlyRate !== undefined && { hourlyRate: dto.hourlyRate }),
        ...(dto.effectiveFrom !== undefined && {
          effectiveFrom: new Date(dto.effectiveFrom),
        }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: new Date(dto.effectiveTo),
        }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
    });
  }

  /**
   * DELETE /config/pricing/events/:id — soft delete (BR-09: reservations keep lockedRateTableId).
   */
  async deleteRateTable(id: string) {
    const existing = await this.prisma.rateTable.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`RateTable not found: ${id}`);
    }

    if (existing.type === RateTableType.DEFAULT) {
      throw new BadRequestException('Cannot delete DEFAULT rate table');
    }

    return this.prisma.rateTable.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ─── 29.2: Building Config ─────────────────────────────────────────────────

  /**
   * GET /config/building — return building structure info.
   * Req 10.1
   */
  async getBuilding() {
    const floors = await this.prisma.floor.findMany({
      orderBy: { floorNumber: 'asc' },
    });

    const slotCounts = await this.prisma.slot.groupBy({
      by: ['floorId', 'zone'],
      _count: { id: true },
    });

    const occupiedCounts = await this.prisma.slot.groupBy({
      by: ['floorId', 'zone'],
      where: { status: { in: ['occupied', 'reserved'] } },
      _count: { id: true },
    });

    const maintenanceCounts = await this.prisma.slot.groupBy({
      by: ['floorId', 'zone'],
      where: { status: 'maintenance' },
      _count: { id: true },
    });

    return {
      floors: floors.map((f) => {
        const zoneATotal = slotCounts.find(
          (s) => s.floorId === f.id && s.zone === 'A',
        )?._count.id ?? 0;
        const zoneBTotal = slotCounts.find(
          (s) => s.floorId === f.id && s.zone === 'B',
        )?._count.id ?? 0;
        const zoneAOccupied = occupiedCounts.find(
          (s) => s.floorId === f.id && s.zone === 'A',
        )?._count.id ?? 0;
        const zoneBOccupied = occupiedCounts.find(
          (s) => s.floorId === f.id && s.zone === 'B',
        )?._count.id ?? 0;
        const zoneAMaintenance = maintenanceCounts.find(
          (s) => s.floorId === f.id && s.zone === 'A',
        )?._count.id ?? 0;
        const zoneBMaintenance = maintenanceCounts.find(
          (s) => s.floorId === f.id && s.zone === 'B',
        )?._count.id ?? 0;

        return {
          id: f.id,
          floorNumber: f.floorNumber,
          name: f.name,
          zoneA: { total: zoneATotal, occupied: zoneAOccupied, maintenance: zoneAMaintenance },
          zoneB: { total: zoneBTotal, occupied: zoneBOccupied, maintenance: zoneBMaintenance },
        };
      }),
      summary: {
        totalFloors: floors.length,
        slotsPerFloorZoneA: slotCounts.find((s) => s.zone === 'A')?._count.id ?? 10,
        slotsPerFloorZoneB: slotCounts.find((s) => s.zone === 'B')?._count.id ?? 20,
      },
    };
  }

  /**
   * PUT /config/building — update building structure.
   * 29.3: Validates that slot count doesn't go below occupied count.
   * Req 10.1
   *
   * NOTE: For MVP, this only validates. Actual floor/slot creation/deletion
   * would require a migration-like operation. We return validation result.
   */
  async updateBuilding(dto: UpdateBuildingDto) {
    // 29.3: Check current occupied counts per zone
    const occupiedA = await this.prisma.slot.count({
      where: { zone: 'A', status: { in: ['occupied', 'reserved'] } },
    });
    const occupiedB = await this.prisma.slot.count({
      where: { zone: 'B', status: { in: ['occupied', 'reserved'] } },
    });

    const totalRequestedA = dto.floors * dto.slotsPerFloorZoneA;
    const totalRequestedB = dto.floors * dto.slotsPerFloorZoneB;

    if (totalRequestedA < occupiedA) {
      throw new ConflictException(
        `Không thể giảm Zone A xuống ${totalRequestedA} slot — hiện có ${occupiedA} slot đang sử dụng`,
      );
    }

    if (totalRequestedB < occupiedB) {
      throw new ConflictException(
        `Không thể giảm Zone B xuống ${totalRequestedB} slot — hiện có ${occupiedB} slot đang sử dụng`,
      );
    }

    // For MVP: store the config intent in SystemConfig
    await this.prisma.systemConfig.upsert({
      where: { configKey: 'building_floors' },
      update: { configValue: String(dto.floors) },
      create: {
        configKey: 'building_floors',
        configValue: String(dto.floors),
        description: 'Number of floors in the building',
      },
    });

    await this.prisma.systemConfig.upsert({
      where: { configKey: 'slots_per_floor_zone_a' },
      update: { configValue: String(dto.slotsPerFloorZoneA) },
      create: {
        configKey: 'slots_per_floor_zone_a',
        configValue: String(dto.slotsPerFloorZoneA),
        description: 'Number of car slots per floor (Zone A)',
      },
    });

    await this.prisma.systemConfig.upsert({
      where: { configKey: 'slots_per_floor_zone_b' },
      update: { configValue: String(dto.slotsPerFloorZoneB) },
      create: {
        configKey: 'slots_per_floor_zone_b',
        configValue: String(dto.slotsPerFloorZoneB),
        description: 'Number of motorbike slots per floor (Zone B)',
      },
    });

    return {
      message: 'Building configuration updated',
      config: {
        floors: dto.floors,
        slotsPerFloorZoneA: dto.slotsPerFloorZoneA,
        slotsPerFloorZoneB: dto.slotsPerFloorZoneB,
        totalSlots: dto.floors * (dto.slotsPerFloorZoneA + dto.slotsPerFloorZoneB),
      },
    };
  }

  // ─── 31.3: Strategy Config ─────────────────────────────────────────────────

  /**
   * Update the active allocation strategy in SystemConfig.
   */
  async updateStrategy(strategyName: string) {
    await this.prisma.systemConfig.upsert({
      where: { configKey: 'active_allocation_strategy' },
      update: { configValue: strategyName },
      create: {
        configKey: 'active_allocation_strategy',
        configValue: strategyName,
        description: 'Current slot allocation algorithm',
      },
    });

    return {
      message: 'Allocation strategy updated',
      activeStrategy: strategyName,
    };
  }
}
