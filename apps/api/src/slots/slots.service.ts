import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ReservationStatus, SlotStatus, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSlotStatusDto } from './dto';

@Injectable()
export class SlotsService {
  private static readonly DEFAULT_RESERVATION_WINDOW_MINUTES = 30;
  private static readonly MAX_PLANNED_ARRIVAL_DAYS = 7;

  constructor(private readonly prisma: PrismaService) {}

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
      if (slot.status === 'available') entry.available++;
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        a.floorNumber - b.floorNumber || a.zone.localeCompare(b.zone),
    );
  }

  /**
   * Phase 3 availability for a planned reservation.
   *
   * Current PBMS still locks a slot immediately when a reservation is created,
   * so reserved slots are conservatively unavailable for every selected time.
   * The planned-arrival overlap check protects the time-window model and old
   * data where slot status may not fully reflect an active reservation.
   */
  async getPlannedAvailability(
    vehicleType: VehicleType,
    plannedArrivalAtIso: string,
  ) {
    const plannedArrivalAt = this.parsePlannedArrival(plannedArrivalAtIso);
    const timeoutMinutes = await this.getReservationWindowMinutes();
    const requestedEnd = addMinutes(plannedArrivalAt, timeoutMinutes);

    const [slots, activeReservations] = await Promise.all([
      this.prisma.slot.findMany({
        where: {
          vehicleType,
          status: { not: SlotStatus.maintenance },
        },
        select: {
          id: true,
          status: true,
        },
      }),
      this.prisma.reservation.findMany({
        where: {
          vehicleType,
          status: ReservationStatus.active,
          slot: {
            status: { not: SlotStatus.maintenance },
          },
        },
        select: {
          slotId: true,
          plannedArrivalAt: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
    ]);

    const conflictingSlotIds = new Set<number>();
    for (const reservation of activeReservations) {
      const windowStart = reservation.plannedArrivalAt ?? reservation.createdAt;
      const windowEnd = reservation.plannedArrivalAt
        ? addMinutes(reservation.plannedArrivalAt, timeoutMinutes)
        : reservation.expiresAt;

      if (windowsOverlap(plannedArrivalAt, requestedEnd, windowStart, windowEnd)) {
        conflictingSlotIds.add(reservation.slotId);
      }
    }

    let availableCount = 0;
    let reservedCount = 0;
    let occupiedCount = 0;

    for (const slot of slots) {
      if (slot.status === SlotStatus.occupied) {
        occupiedCount++;
        continue;
      }

      if (
        slot.status === SlotStatus.reserved ||
        conflictingSlotIds.has(slot.id)
      ) {
        reservedCount++;
        continue;
      }

      if (slot.status === SlotStatus.available) {
        availableCount++;
      }
    }

    return {
      vehicleType,
      plannedArrivalAt: plannedArrivalAt.toISOString(),
      availableCount,
      reservedCount,
      occupiedCount,
      isAvailable: availableCount > 0,
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
      (s) => s.status === 'occupied' || s.status === 'reserved',
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
        available: zoneA.filter((s) => s.status === 'available').length,
      },
      zoneB: {
        total: zoneB.length,
        available: zoneB.filter((s) => s.status === 'available').length,
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

    // occupied/reserved are managed by session/reservation flows
    if (slot.status === 'occupied' || slot.status === 'reserved') {
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

  private async getReservationWindowMinutes(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { configKey: 'reservation_timeout_minutes' },
    });

    if (config?.configValue) {
      const parsed = parseInt(config.configValue, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    return SlotsService.DEFAULT_RESERVATION_WINDOW_MINUTES;
  }

  private parsePlannedArrival(value: string): Date {
    const plannedArrivalAt = new Date(value);

    if (Number.isNaN(plannedArrivalAt.getTime())) {
      throw new BadRequestException('plannedArrivalAt must be a valid ISO date string');
    }

    const now = new Date();
    if (plannedArrivalAt.getTime() <= now.getTime()) {
      throw new BadRequestException('plannedArrivalAt must not be in the past');
    }

    const maxArrival = addDays(now, SlotsService.MAX_PLANNED_ARRIVAL_DAYS);
    if (plannedArrivalAt.getTime() > maxArrival.getTime()) {
      throw new BadRequestException(
        `plannedArrivalAt must be within ${SlotsService.MAX_PLANNED_ARRIVAL_DAYS} days`,
      );
    }

    return plannedArrivalAt;
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function windowsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
