import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSlotStatusDto } from './dto';

@Injectable()
export class SlotsService {
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
}
