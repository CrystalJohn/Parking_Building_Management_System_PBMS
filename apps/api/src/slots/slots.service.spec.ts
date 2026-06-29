import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SlotStatus, VehicleType, Zone } from '@prisma/client';
import { SlotsService } from './slots.service';
import { AllocationService } from './allocation.service';
import { PrismaService } from '../prisma/prisma.service';

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

describe('SlotsService', () => {
  let service: SlotsService;
  let prisma: {
    slot: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let allocationService: { getCandidateSlots: jest.Mock };

  beforeEach(async () => {
    prisma = {
      slot: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    allocationService = { getCandidateSlots: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AllocationService, useValue: allocationService },
      ],
    }).compile();

    service = module.get<SlotsService>(SlotsService);
  });

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

  describe('getAvailability', () => {
    it('correctly aggregates available and total counts per floor/zone/vehicleType', async () => {
      const floor1 = makeFloor({ id: 1, floorNumber: 1, name: 'Floor 1' });
      prisma.slot.findMany.mockResolvedValue([
        makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1 }),
        makeSlot({ id: 2, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.occupied, floor: floor1 }),
        makeSlot({ id: 3, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.maintenance, floor: floor1 }),
      ]);

      const result = await service.getAvailability();

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

    it('does not count legacy reserved status as available', async () => {
      prisma.slot.findMany.mockResolvedValue([
        makeSlot({ id: 1, status: SlotStatus.available }),
        makeSlot({ id: 2, status: SlotStatus.reserved }),
      ]);

      const result = await service.getAvailability();

      expect(result[0].available).toBe(1);
      expect(result[0].total).toBe(2);
    });
  });

  describe('getPlannedAvailability', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-26T01:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('uses AllocationService candidate helper as the source of truth', async () => {
      allocationService.getCandidateSlots.mockResolvedValue({
        candidateSlots: [
          makeSlot({ id: 1 }),
          makeSlot({ id: 2 }),
        ],
        allScoringSlots: [],
        occupiedCount: 1,
        reservedCount: 3,
      });

      const result = await service.getPlannedAvailability(
        VehicleType.car,
        '2026-06-26T02:00:00.000Z',
      );

      expect(result).toEqual({
        vehicleType: VehicleType.car,
        plannedArrivalAt: '2026-06-26T02:00:00.000Z',
        availableCount: 2,
        reservedCount: 3,
        occupiedCount: 1,
        isAvailable: true,
      });
      expect(allocationService.getCandidateSlots).toHaveBeenCalledWith(
        VehicleType.car,
      );
    });

    it('returns unavailable when helper returns no candidates', async () => {
      allocationService.getCandidateSlots.mockResolvedValue({
        candidateSlots: [],
        allScoringSlots: [],
        occupiedCount: 1,
        reservedCount: 1,
      });

      const result = await service.getPlannedAvailability(
        VehicleType.car,
        '2026-06-26T02:00:00.000Z',
      );

      expect(result.availableCount).toBe(0);
      expect(result.isAvailable).toBe(false);
    });

    it('rejects invalid plannedArrivalAt', async () => {
      await expect(
        service.getPlannedAvailability(VehicleType.car, 'not-a-date'),
      ).rejects.toThrow(BadRequestException);
      expect(allocationService.getCandidateSlots).not.toHaveBeenCalled();
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

      await expect(
        service.updateStatus(999, { status: SlotStatus.maintenance }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when slot is occupied', async () => {
      prisma.slot.findUnique.mockResolvedValue(makeSlot({ status: SlotStatus.occupied }));

      await expect(
        service.updateStatus(1, { status: SlotStatus.maintenance }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when slot is reserved by an active hold', async () => {
      prisma.slot.findUnique.mockResolvedValue(makeSlot({ status: SlotStatus.reserved }));

      await expect(
        service.updateStatus(1, { status: SlotStatus.available }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
