import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SlotStatus, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from './allocation.service';
import { UpdateSlotStatusDto } from './dto';

@Injectable()
export class SlotsService {
  private static readonly MAX_ADVANCE_MINUTES = 120;

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
  ) {}

  /**
   * 11.1 — Return all slots with floor info.
   */
  async findAll() {
    return this.prisma.slot.findMany({
      include: { floor: true },
      orderBy: [{ floorId: 'asc' }, { zone: 'asc' }, { slotNumber: 'asc' }],
    });
  }

  /**
   * 11.2 — Aggregate available counts by floor / zone / vehicleType.
   * Returns: { floorId, floorNumber, floorName, zone, vehicleType, available, total }[]
   * Req 4.4
   */
  async getAvailability() {
    const slots = await this.prisma.slot.findMany({
      include: { floor: true },
    });

    const map = new Map<
      string,
      {
        floorId: number;
        floorNumber: number;
        floorName: string;
        zone: string;
        vehicleType: string;
        available: number;
        total: number;
      }
    >();

    for (const slot of slots) {
      const key = `${slot.floorId}-${slot.zone}-${slot.vehicleType}`;
      if (!map.has(key)) {
        map.set(key, {
          floorId: slot.floorId,
          floorNumber: slot.floor.floorNumber,
          floorName: slot.floor.name,
          zone: slot.zone,
          vehicleType: slot.vehicleType,
          available: 0,
          total: 0,
        });
      }
      const entry = map.get(key)!;
      entry.total++;
      if (slot.status === SlotStatus.available) entry.available++;
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        a.floorNumber - b.floorNumber || a.zone.localeCompare(b.zone),
    );
  }

  /**
   * Short-term reservation availability.
   * Uses the same physical candidate helper as allocation, so the displayed
   * count and the actual allocation decision cannot drift.
   */
  async getPlannedAvailability(
    vehicleType: VehicleType,
    plannedArrivalAtIso: string,
  ) {
    const plannedArrivalAt = this.parsePlannedArrival(plannedArrivalAtIso);
    const { candidateSlots, reservedCount, occupiedCount } =
      await this.allocationService.getCandidateSlots(vehicleType);

    return {
      vehicleType,
      plannedArrivalAt: plannedArrivalAt.toISOString(),
      availableCount: candidateSlots.length,
      reservedCount,
      occupiedCount,
      isAvailable: candidateSlots.length > 0,
    };
  }

  /**
   * Public summary — total vs occupied/reserved for the entire building.
   * No auth required. Used by landing page.
   */
  async getPublicSummary() {
    const slots = await this.prisma.slot.findMany({
      where: { status: { not: 'maintenance' } },
      select: { status: true, zone: true },
    });

    const total = slots.length;
    const occupied = slots.filter(
      (s) =>
        s.status === SlotStatus.occupied || s.status === SlotStatus.reserved,
    ).length;
    const available = total - occupied;
    const percent = total > 0 ? Math.round((occupied / total) * 100) : 0;

    const zoneA = slots.filter((s) => s.zone === 'A');
    const zoneB = slots.filter((s) => s.zone === 'B');

    return {
      total,
      occupied,
      available,
      percent,
      zoneA: {
        total: zoneA.length,
        available: zoneA.filter((s) => s.status === SlotStatus.available).length,
      },
      zoneB: {
        total: zoneB.length,
        available: zoneB.filter((s) => s.status === SlotStatus.available).length,
      },
    };
  }

  /**
   * 11.3 — Set slot to maintenance or available (manager only).
   * Req 10.3
   */
  async updateStatus(id: number, dto: UpdateSlotStatusDto) {
    const slot = await this.prisma.slot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException(`Slot with id ${id} not found`);

    // occupied/reserved are managed by session/reservation flows.
    if (
      slot.status === SlotStatus.occupied ||
      slot.status === SlotStatus.reserved
    ) {
      throw new ConflictException(
        `Cannot change status of a slot that is currently ${slot.status}`,
      );
    }

    return this.prisma.slot.update({
      where: { id },
      data: { status: dto.status },
      include: { floor: true },
    });
  }

  private parsePlannedArrival(value: string): Date {
    const plannedArrivalAt = new Date(value);

    if (Number.isNaN(plannedArrivalAt.getTime())) {
      throw new BadRequestException('plannedArrivalAt must be a valid ISO date string');
    }

    const now = new Date();
    if (plannedArrivalAt.getTime() < now.getTime()) {
      throw new BadRequestException('Arrival time cannot be in the past');
    }

    const maxArrival = addMinutes(now, SlotsService.MAX_ADVANCE_MINUTES);
    if (plannedArrivalAt.getTime() > maxArrival.getTime()) {
      throw new BadRequestException(
        'You can only reserve for arrival within the next 2 hours',
      );
    }

    return plannedArrivalAt;
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
