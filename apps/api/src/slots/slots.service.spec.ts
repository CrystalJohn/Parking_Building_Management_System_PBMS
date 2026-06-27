import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { ReservationStatus, SlotStatus, Zone, VehicleType } from '@prisma/client';
import { SlotsService } from './slots.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeFloor = (overrides: Partial<{ id: number; floorNumber: number; name: string }> = {}) => ({
  id: 1,
  floorNumber: 1,
  name: 'Floor 1',
  ...overrides,
});

const makeSlot = (
  overrides: Partial<{
    id: number;
    floorId: number;
    zone: Zone;
    slotNumber: number;
    code: string;
    status: SlotStatus;
    vehicleType: VehicleType;
    floor: ReturnType<typeof makeFloor>;
  }> = {},
) => ({
  id: 1,
  floorId: 1,
  zone: Zone.A,
  slotNumber: 1,
  code: 'F1-A-001',
  status: SlotStatus.available,
  vehicleType: VehicleType.car,
  floor: makeFloor(),
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SlotsService', () => {
  let service: SlotsService;
  let prisma: {
    slot: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    reservation: {
      findMany: jest.Mock;
    };
    systemConfig: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      slot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      reservation: {
        findMany: jest.fn(),
      },
      systemConfig: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SlotsService>(SlotsService);
    prisma.systemConfig.findUnique.mockResolvedValue(null);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all slots with floor info', async () => {
      const slots = [makeSlot(), makeSlot({ id: 2, slotNumber: 2, code: 'F1-A-002' })];
      prisma.slot.findMany.mockResolvedValue(slots);

      const result = await service.findAll();

      expect(result).toEqual(slots);
      expect(prisma.slot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { floor: true },
          orderBy: [{ floorId: 'asc' }, { zone: 'asc' }, { slotNumber: 'asc' }],
        }),
      );
    });
  });

  // ── getAvailability ────────────────────────────────────────────────────────

  describe('getAvailability', () => {
    it('correctly aggregates available and total counts per floor/zone/vehicleType', async () => {
      const floor1 = makeFloor({ id: 1, floorNumber: 1, name: 'Floor 1' });
      const slots = [
        makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1 }),
        makeSlot({ id: 2, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.occupied, floor: floor1 }),
        makeSlot({ id: 3, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.maintenance, floor: floor1 }),
      ];
      prisma.slot.findMany.mockResolvedValue(slots);

      const result = await service.getAvailability();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        floorId: 1,
        floorNumber: 1,
        floorName: 'Floor 1',
        zone: Zone.A,
        vehicleType: VehicleType.car,
        available: 1,
        total: 3,
      });
    });

    it('groups by floor, zone, and vehicleType separately', async () => {
      const floor1 = makeFloor({ id: 1, floorNumber: 1, name: 'Floor 1' });
      const floor2 = makeFloor({ id: 2, floorNumber: 2, name: 'Floor 2' });
      const slots = [
        makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1 }),
        makeSlot({ id: 2, floorId: 1, zone: Zone.B, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1 }),
        makeSlot({ id: 3, floorId: 1, zone: Zone.A, vehicleType: VehicleType.motorbike, status: SlotStatus.available, floor: floor1 }),
        makeSlot({ id: 4, floorId: 2, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor2 }),
      ];
      prisma.slot.findMany.mockResolvedValue(slots);

      const result = await service.getAvailability();

      expect(result).toHaveLength(4);
      // sorted by floorNumber then zone
      expect(result[0]).toMatchObject({ floorNumber: 1, zone: Zone.A, vehicleType: VehicleType.car });
      expect(result[1]).toMatchObject({ floorNumber: 1, zone: Zone.A, vehicleType: VehicleType.motorbike });
      expect(result[2]).toMatchObject({ floorNumber: 1, zone: Zone.B, vehicleType: VehicleType.car });
      expect(result[3]).toMatchObject({ floorNumber: 2, zone: Zone.A, vehicleType: VehicleType.car });
    });

    it('counts only available slots (not occupied, reserved, or maintenance)', async () => {
      const floor1 = makeFloor();
      const slots = [
        makeSlot({ id: 1, status: SlotStatus.available, floor: floor1 }),
        makeSlot({ id: 2, status: SlotStatus.occupied, floor: floor1 }),
        makeSlot({ id: 3, status: SlotStatus.reserved, floor: floor1 }),
        makeSlot({ id: 4, status: SlotStatus.maintenance, floor: floor1 }),
      ];
      prisma.slot.findMany.mockResolvedValue(slots);

      const result = await service.getAvailability();

      expect(result[0].available).toBe(1);
      expect(result[0].total).toBe(4);
    });

    it('returns empty array when no slots exist', async () => {
      prisma.slot.findMany.mockResolvedValue([]);

      const result = await service.getAvailability();

      expect(result).toEqual([]);
    });
  });

  // ── updateStatus ───────────────────────────────────────────────────────────

  describe('getPlannedAvailability', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-26T01:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns mobile-friendly availability counts for a selected vehicle type and time', async () => {
      prisma.slot.findMany.mockResolvedValue([
        makeSlot({ id: 1, vehicleType: VehicleType.car, status: SlotStatus.available }),
        makeSlot({ id: 2, vehicleType: VehicleType.car, status: SlotStatus.reserved }),
        makeSlot({ id: 3, vehicleType: VehicleType.car, status: SlotStatus.occupied }),
      ]);
      prisma.reservation.findMany.mockResolvedValue([]);

      const result = await service.getPlannedAvailability(
        VehicleType.car,
        '2026-06-26T02:00:00.000Z',
      );

      expect(result).toEqual({
        vehicleType: VehicleType.car,
        plannedArrivalAt: '2026-06-26T02:00:00.000Z',
        availableCount: 1,
        reservedCount: 1,
        occupiedCount: 1,
        isAvailable: true,
      });
      expect(prisma.slot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            vehicleType: VehicleType.car,
            status: { not: SlotStatus.maintenance },
          },
        }),
      );
    });

    it('does not count occupied or maintenance slots as available', async () => {
      prisma.slot.findMany.mockResolvedValue([
        makeSlot({ id: 1, status: SlotStatus.occupied }),
      ]);
      prisma.reservation.findMany.mockResolvedValue([]);

      const result = await service.getPlannedAvailability(
        VehicleType.car,
        '2026-06-26T02:00:00.000Z',
      );

      expect(result.availableCount).toBe(0);
      expect(result.occupiedCount).toBe(1);
      expect(result.isAvailable).toBe(false);
    });

    it('active conflicting reservation reduces planned availability', async () => {
      prisma.slot.findMany.mockResolvedValue([
        makeSlot({ id: 1, status: SlotStatus.available }),
        makeSlot({ id: 2, status: SlotStatus.available }),
      ]);
      prisma.reservation.findMany.mockResolvedValue([
        {
          slotId: 2,
          status: ReservationStatus.active,
          plannedArrivalAt: new Date('2026-06-26T02:15:00.000Z'),
          createdAt: new Date('2026-06-26T01:30:00.000Z'),
          expiresAt: new Date('2026-06-26T02:00:00.000Z'),
        },
      ]);

      const result = await service.getPlannedAvailability(
        VehicleType.car,
        '2026-06-26T02:00:00.000Z',
      );

      expect(result.availableCount).toBe(1);
      expect(result.reservedCount).toBe(1);
      expect(result.isAvailable).toBe(true);
    });

    it('rejects invalid plannedArrivalAt', async () => {
      await expect(
        service.getPlannedAvailability(VehicleType.car, 'not-a-date'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.slot.findMany).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('sets slot to maintenance successfully', async () => {
      const slot = makeSlot({ status: SlotStatus.available });
      const updated = makeSlot({ status: SlotStatus.maintenance });
      prisma.slot.findUnique.mockResolvedValue(slot);
      prisma.slot.update.mockResolvedValue(updated);

      const result = await service.updateStatus(1, { status: SlotStatus.maintenance });

      expect(result.status).toBe(SlotStatus.maintenance);
      expect(prisma.slot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { status: SlotStatus.maintenance },
          include: { floor: true },
        }),
      );
    });

    it('sets slot back to available from maintenance', async () => {
      const slot = makeSlot({ status: SlotStatus.maintenance });
      const updated = makeSlot({ status: SlotStatus.available });
      prisma.slot.findUnique.mockResolvedValue(slot);
      prisma.slot.update.mockResolvedValue(updated);

      const result = await service.updateStatus(1, { status: SlotStatus.available });

      expect(result.status).toBe(SlotStatus.available);
    });

    it('throws NotFoundException for non-existent slot', async () => {
      prisma.slot.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus(999, { status: SlotStatus.maintenance })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.slot.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when slot is occupied', async () => {
      const slot = makeSlot({ status: SlotStatus.occupied });
      prisma.slot.findUnique.mockResolvedValue(slot);

      await expect(service.updateStatus(1, { status: SlotStatus.maintenance })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.slot.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when slot is reserved', async () => {
      const slot = makeSlot({ status: SlotStatus.reserved });
      prisma.slot.findUnique.mockResolvedValue(slot);

      await expect(service.updateStatus(1, { status: SlotStatus.maintenance })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.slot.update).not.toHaveBeenCalled();
    });
  });
});
