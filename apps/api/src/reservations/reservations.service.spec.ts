import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  VehicleType,
  Zone,
  SlotStatus,
  ReservationStatus,
} from '@prisma/client';
import { ReservationsService } from './reservations.service';
import { AllocationService } from '../slots/allocation.service';
import { SlotsService } from '../slots/slots.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeFloor = (overrides: Partial<{ id: number; floorNumber: number; name: string }> = {}) => ({
  id: 1,
  floorNumber: 1,
  name: 'T1',
  ...overrides,
});

const makeSlot = (overrides: Partial<{
  id: number; floorId: number; zone: Zone; slotNumber: number;
  code: string; status: SlotStatus; vehicleType: VehicleType;
  walkingDistance: number;
  floor: ReturnType<typeof makeFloor>;
}> = {}) => ({
  id: 1,
  floorId: 1,
  zone: Zone.B,
  slotNumber: 1,
  code: 'T1-B-01',
  status: SlotStatus.available,
  vehicleType: VehicleType.motorbike,
  walkingDistance: 20,
  floor: makeFloor(),
  ...overrides,
});

const makeReservation = (overrides: Partial<{
  id: string;
  driverId: string;
  slotId: number;
  vehicleType: VehicleType;
  plannedArrivalAt: Date | null;
  status: ReservationStatus;
  createdAt: Date;
  expiresAt: Date;
  slot: ReturnType<typeof makeSlot>;
}> = {}) => ({
  id: 'reservation-uuid-1',
  driverId: 'driver-uuid',
  slotId: 1,
  vehicleType: VehicleType.motorbike,
  plannedArrivalAt: new Date('2024-01-01T09:00:00Z'),
  status: ReservationStatus.active,
  createdAt: new Date('2024-01-01T08:00:00Z'),
  expiresAt: new Date('2024-01-01T08:30:00Z'),
  slot: makeSlot(),
  ...overrides,
});

const makeCreateDto = (
  overrides: Partial<{
    vehicleType: VehicleType;
    plannedArrivalAt: string;
  }> = {},
) => ({
  vehicleType: VehicleType.motorbike,
  plannedArrivalAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReservationsService', () => {
  let service: ReservationsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    reservation: { findUnique: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    slot: { update: jest.Mock };
    systemConfig: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let allocationService: { allocate: jest.Mock };
  let slotsService: { getPlannedAvailability: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      reservation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      slot: { update: jest.fn() },
      systemConfig: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    allocationService = { allocate: jest.fn() };
    slotsService = { getPlannedAvailability: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AllocationService, useValue: allocationService },
        { provide: SlotsService, useValue: slotsService },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── create() (18.1, 18.2, 18.5) ──────────────────────────────────────────

  describe('create()', () => {
    const driverId = 'driver-uuid';
    const slot = makeSlot();

    beforeEach(() => {
      // Driver exists and is active
      prisma.user.findUnique.mockResolvedValue({
        id: driverId,
        role: 'driver',
        isActive: true,
      });

      // SystemConfig returns 30 min timeout
      prisma.systemConfig.findUnique.mockResolvedValue({
        configKey: 'reservation_timeout_minutes',
        configValue: '30',
      });

      // P1: No existing active reservation by default
      prisma.reservation.findFirst.mockResolvedValue(null);

      // Allocation succeeds
      allocationService.allocate.mockResolvedValue({
        slot,
        allocationStrategy: 'balanced_occupancy',
        allocationTimeMs: 3,
      });

      slotsService.getPlannedAvailability.mockResolvedValue({
        vehicleType: VehicleType.motorbike,
        plannedArrivalAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        availableCount: 1,
        reservedCount: 0,
        occupiedCount: 0,
        isAvailable: true,
      });

      // Transaction executes callback
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue({ ...slot, status: 'reserved' }) },
          reservation: {
            create: jest.fn().mockResolvedValue(makeReservation()),
          },
        };
        return fn(tx);
      });
    });

    it('creates a reservation and returns slot info (18.1)', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const result = await service.create(
        makeCreateDto(),
        driverId,
      );

      expect(result.reservation).toHaveProperty('id');
      expect(result.reservation).toHaveProperty('expiresAt');
      expect(result.reservation).toHaveProperty('plannedArrivalAt');
      expect(result.reservation.status).toBe('active');
      expect(result.slot).toHaveProperty('code');
      expect(result.slot).toHaveProperty('floor');
      expect(allocationService.allocate).toHaveBeenCalledWith(VehicleType.motorbike);
      expect(slotsService.getPlannedAvailability).toHaveBeenCalledWith(
        VehicleType.motorbike,
        expect.any(String),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reservation created'),
      );
    });

    it('throws ForbiddenException when driver not found (18.5)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create(makeCreateDto(), driverId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when driver is deactivated (18.5)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: driverId,
        role: 'driver',
        isActive: false,
      });

      await expect(
        service.create(makeCreateDto(), driverId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user is not a driver (18.5)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: driverId,
        role: 'staff',
        isActive: true,
      });

      await expect(
        service.create(makeCreateDto(), driverId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when no slot available', async () => {
      allocationService.allocate.mockRejectedValue(
        new ConflictException('No available slot for vehicle type: motorbike'),
      );

      await expect(
        service.create(makeCreateDto(), driverId),
      ).rejects.toThrow(ConflictException);
    });

    it('sets slot to reserved and creates reservation with expires_at (18.2)', async () => {
      let capturedSlotUpdate: unknown = null;
      let capturedReservationData: unknown = null;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: {
            update: jest.fn().mockImplementation((args) => {
              capturedSlotUpdate = args;
              return Promise.resolve({ ...slot, status: 'reserved' });
            }),
          },
          reservation: {
            create: jest.fn().mockImplementation((args) => {
              capturedReservationData = args;
              return Promise.resolve(makeReservation());
            }),
          },
        };
        return fn(tx);
      });

      jest.useFakeTimers().setSystemTime(new Date('2024-01-01T08:00:00Z'));

      await service.create(makeCreateDto(), driverId);

      // Slot set to reserved
      expect((capturedSlotUpdate as any).data.status).toBe('reserved');

      // Reservation has expires_at = planned arrival + 30 min
      const expiresAt = (capturedReservationData as any).data.expiresAt as Date;
      expect(expiresAt.getTime()).toBe(
        new Date('2024-01-01T09:30:00Z').getTime(),
      );
      const plannedArrivalAt = (capturedReservationData as any).data.plannedArrivalAt as Date;
      expect(plannedArrivalAt.getTime()).toBe(
        new Date('2024-01-01T09:00:00Z').getTime(),
      );

      jest.useRealTimers();
    });

    it('calculates expiresAt from plannedArrivalAt, not createdAt or now', async () => {
      const plannedArrivalAt = '2026-06-27T05:00:00.000Z';
      let capturedReservationData: unknown = null;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue({ ...slot, status: 'reserved' }) },
          reservation: {
            create: jest.fn().mockImplementation((args) => {
              capturedReservationData = args;
              return Promise.resolve(
                makeReservation({
                  plannedArrivalAt: args.data.plannedArrivalAt,
                  expiresAt: args.data.expiresAt,
                }),
              );
            }),
          },
        };
        return fn(tx);
      });

      jest.useFakeTimers().setSystemTime(new Date('2026-06-27T03:54:32.920Z'));

      await service.create(
        makeCreateDto({
          vehicleType: VehicleType.car,
          plannedArrivalAt,
        }),
        driverId,
      );

      const expiresAt = (capturedReservationData as any).data.expiresAt as Date;
      expect(expiresAt.toISOString()).toBe('2026-06-27T05:30:00.000Z');
      expect(expiresAt.toISOString()).not.toBe('2026-06-27T04:24:32.920Z');

      jest.useRealTimers();
    });

    it('throws ConflictException when no slot is available for selected plannedArrivalAt', async () => {
      slotsService.getPlannedAvailability.mockResolvedValue({
        vehicleType: VehicleType.motorbike,
        plannedArrivalAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        availableCount: 0,
        reservedCount: 1,
        occupiedCount: 0,
        isAvailable: false,
      });

      await expect(
        service.create(makeCreateDto(), driverId),
      ).rejects.toThrow(ConflictException);

      expect(allocationService.allocate).not.toHaveBeenCalled();
    });

    it('rejects invalid plannedArrivalAt', async () => {
      await expect(
        service.create(
          makeCreateDto({ plannedArrivalAt: 'not-a-date' }),
          driverId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(allocationService.allocate).not.toHaveBeenCalled();
    });

    it('rejects plannedArrivalAt in the past', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-01T08:00:00Z'));

      await expect(
        service.create(
          makeCreateDto({ plannedArrivalAt: '2024-01-01T07:59:00.000Z' }),
          driverId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(allocationService.allocate).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('rejects plannedArrivalAt outside the 7 day booking window', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-01-01T08:00:00Z'));

      await expect(
        service.create(
          makeCreateDto({ plannedArrivalAt: '2024-01-09T08:01:00.000Z' }),
          driverId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(allocationService.allocate).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('uses the slot selected by fair_distance_based allocation', async () => {
      const selectedSlot = makeSlot({
        id: 9,
        code: 'T1-B-09',
        slotNumber: 9,
        walkingDistance: 18,
      });
      allocationService.allocate.mockResolvedValue({
        slot: selectedSlot,
        allocationStrategy: 'fair_distance_based',
        allocationTimeMs: 4,
      });

      let lockedSlotId: number | null = null;
      let reservedSlotId: number | null = null;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray, id: number) => {
            lockedSlotId = id;
            return Promise.resolve([{ id, status: 'available' }]);
          }),
          slot: {
            update: jest.fn().mockImplementation((args) => {
              reservedSlotId = args.where.id;
              return Promise.resolve({ ...selectedSlot, status: 'reserved' });
            }),
          },
          reservation: {
            create: jest.fn().mockResolvedValue(
              makeReservation({ slotId: selectedSlot.id, slot: selectedSlot }),
            ),
          },
        };
        return fn(tx);
      });

      const result = await service.create(
        makeCreateDto(),
        driverId,
      );

      expect(allocationService.allocate).toHaveBeenCalledWith(VehicleType.motorbike);
      expect(lockedSlotId).toBe(selectedSlot.id);
      expect(reservedSlotId).toBe(selectedSlot.id);
      expect(result.slot.code).toBe('T1-B-09');
    });

    it('ignores any selectedSlotId and still uses smart allocation', async () => {
      const selectedSlot = makeSlot({
        id: 12,
        code: 'T1-B-12',
        slotNumber: 12,
      });
      allocationService.allocate.mockResolvedValue({
        slot: selectedSlot,
        allocationStrategy: 'fair_distance_based',
        allocationTimeMs: 4,
      });

      let reservedSlotId: number | null = null;
      let createdSlotId: number | null = null;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: selectedSlot.id, status: 'available' }]),
          slot: {
            update: jest.fn().mockImplementation((args) => {
              reservedSlotId = args.where.id;
              return Promise.resolve({ ...selectedSlot, status: 'reserved' });
            }),
          },
          reservation: {
            create: jest.fn().mockImplementation((args) => {
              createdSlotId = args.data.slotId;
              return Promise.resolve(makeReservation({ slotId: selectedSlot.id, slot: selectedSlot }));
            }),
          },
        };
        return fn(tx);
      });

      const dtoWithSelectedSlot = {
        ...makeCreateDto(),
        selectedSlotId: 999,
      } as any;

      const result = await service.create(dtoWithSelectedSlot, driverId);

      expect(allocationService.allocate).toHaveBeenCalledWith(VehicleType.motorbike);
      expect(reservedSlotId).toBe(selectedSlot.id);
      expect(createdSlotId).toBe(selectedSlot.id);
      expect(result.slot.code).toBe('T1-B-12');
    });

    // P1: duplicate active reservation guard
    it('throws ConflictException when driver already has an active reservation for the same vehicle type (P1)', async () => {
      prisma.reservation.findFirst.mockResolvedValue({
        id: 'existing-reservation-uuid',
      });

      await expect(
        service.create(makeCreateDto(), driverId),
      ).rejects.toThrow(ConflictException);

      // Allocation should never be called if guard fires
      expect(allocationService.allocate).not.toHaveBeenCalled();
    });

    it('allows creating a car reservation when driver only has an active motorbike reservation (P1)', async () => {
      // findFirst returns null for car (no existing active car reservation)
      prisma.reservation.findFirst.mockResolvedValue(null);
      const carSlot = makeSlot({ zone: Zone.A, vehicleType: VehicleType.car, code: 'T1-A-01' });
      allocationService.allocate.mockResolvedValue({
        slot: carSlot,
        allocationStrategy: 'balanced_occupancy',
        allocationTimeMs: 2,
      });

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: carSlot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue({ ...carSlot, status: 'reserved' }) },
          reservation: {
            create: jest.fn().mockResolvedValue(
              makeReservation({ vehicleType: VehicleType.car, slot: carSlot }),
            ),
          },
        };
        return fn(tx);
      });

      const result = await service.create(makeCreateDto({ vehicleType: VehicleType.car }), driverId);

      expect(allocationService.allocate).toHaveBeenCalledWith(VehicleType.car);
      expect(result.reservation).toBeDefined();
    });

    it('reads timeout from SystemConfig', async () => {
      prisma.systemConfig.findUnique.mockResolvedValue({
        configKey: 'reservation_timeout_minutes',
        configValue: '15',
      });

      let capturedReservationData: unknown = null;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue({ ...slot, status: 'reserved' }) },
          reservation: {
            create: jest.fn().mockImplementation((args) => {
              capturedReservationData = args;
              return Promise.resolve(makeReservation());
            }),
          },
        };
        return fn(tx);
      });

      jest.useFakeTimers().setSystemTime(new Date('2024-01-01T08:00:00Z'));

      await service.create(makeCreateDto(), driverId);

      // 15 min timeout from planned arrival
      const expiresAt = (capturedReservationData as any).data.expiresAt as Date;
      expect(expiresAt.getTime()).toBe(
        new Date('2024-01-01T09:15:00Z').getTime(),
      );

      jest.useRealTimers();
    });
  });

  // ── findMyReservations() (18.3) ───────────────────────────────────────────

  describe('findMyReservations()', () => {
    it('returns reservations for the given driver', async () => {
      const reservations = [makeReservation(), makeReservation({ id: 'reservation-uuid-2' })];
      prisma.reservation.findMany.mockResolvedValue(reservations);

      const result = await service.findMyReservations('driver-uuid');

      expect(result).toEqual(reservations);
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId: 'driver-uuid' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // ── cancel() (18.4) ──────────────────────────────────────────────────────

  describe('cancel()', () => {
    it('cancels reservation and releases slot', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      prisma.reservation.findUnique.mockResolvedValue(makeReservation());
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          reservation: { update: jest.fn().mockResolvedValue({}) },
          slot: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.cancel('reservation-uuid-1', 'driver-uuid');

      expect(result.message).toContain('cancelled');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reservation cancelled'),
      );
    });

    it('throws NotFoundException when reservation not found', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.cancel('nonexistent', 'driver-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when driver does not own reservation', async () => {
      prisma.reservation.findUnique.mockResolvedValue(
        makeReservation({ driverId: 'other-driver' }),
      );

      await expect(
        service.cancel('reservation-uuid-1', 'driver-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when reservation is not active', async () => {
      prisma.reservation.findUnique.mockResolvedValue(
        makeReservation({ status: ReservationStatus.expired }),
      );

      await expect(
        service.cancel('reservation-uuid-1', 'driver-uuid'),
      ).rejects.toThrow(ConflictException);
    });

    it('sets reservation to cancelled and slot to available in transaction', async () => {
      prisma.reservation.findUnique.mockResolvedValue(makeReservation());

      let txReservationUpdate: unknown = null;
      let txSlotUpdate: unknown = null;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          reservation: {
            update: jest.fn().mockImplementation((args) => {
              txReservationUpdate = args;
              return Promise.resolve({});
            }),
          },
          slot: {
            update: jest.fn().mockImplementation((args) => {
              txSlotUpdate = args;
              return Promise.resolve({});
            }),
          },
        };
        return fn(tx);
      });

      await service.cancel('reservation-uuid-1', 'driver-uuid');

      expect((txReservationUpdate as any).data.status).toBe('cancelled');
      expect((txSlotUpdate as any).data.status).toBe('available');
      expect((txSlotUpdate as any).where.id).toBe(1);
    });
  });

  // ── handleExpiredReservations() (Task 19) ─────────────────────────────────

  describe('handleExpiredReservations()', () => {
    it('does nothing when no expired reservations', async () => {
      prisma.reservation.findMany.mockResolvedValue([]);

      await service.handleExpiredReservations();

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('expires reservations past their expires_at and releases slots', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      const expired = [
        { id: 'res-1', slotId: 1 },
        { id: 'res-2', slotId: 5 },
      ];
      prisma.reservation.findMany.mockResolvedValue(expired);

      const txCalls: { reservationIds: string[]; slotIds: number[] } = {
        reservationIds: [],
        slotIds: [],
      };

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          reservation: {
            update: jest.fn().mockImplementation((args) => {
              txCalls.reservationIds.push(args.where.id);
              return Promise.resolve({});
            }),
          },
          slot: {
            update: jest.fn().mockImplementation((args) => {
              txCalls.slotIds.push(args.where.id);
              return Promise.resolve({});
            }),
          },
        };
        return fn(tx);
      });

      await service.handleExpiredReservations();

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(txCalls.reservationIds).toEqual(['res-1', 'res-2']);
      expect(txCalls.slotIds).toEqual([1, 5]);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reservation expired'),
      );
    });

    it('queries for active reservations with expiresAt < now', async () => {
      prisma.reservation.findMany.mockResolvedValue([]);

      const mockNow = new Date('2024-01-01T09:00:00Z');
      jest.useFakeTimers().setSystemTime(mockNow);

      await service.handleExpiredReservations();

      expect(prisma.reservation.findMany).toHaveBeenCalledWith({
        where: {
          status: 'active',
          expiresAt: { lt: mockNow },
        },
        select: { id: true, slotId: true },
      });

      jest.useRealTimers();
    });

    it('continues processing other reservations if one fails', async () => {
      const expired = [
        { id: 'res-1', slotId: 1 },
        { id: 'res-2', slotId: 5 },
      ];
      prisma.reservation.findMany.mockResolvedValue(expired);

      let callCount = 0;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('DB connection lost');
        }
        const tx = {
          reservation: { update: jest.fn().mockResolvedValue({}) },
          slot: { update: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      // Should not throw — logs error and continues
      await service.handleExpiredReservations();

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});

// ── findOne() (P0) ────────────────────────────────────────────────────────

describe('ReservationsService — findOne()', () => {
  let service: ReservationsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    reservation: { findUnique: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    slot: { update: jest.Mock };
    systemConfig: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      reservation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      slot: { update: jest.fn() },
      systemConfig: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AllocationService, useValue: { allocate: jest.fn() } },
        { provide: SlotsService, useValue: { getPlannedAvailability: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
  });

  it('returns the reservation when driver owns it', async () => {
    const reservation = makeReservation();
    prisma.reservation.findUnique.mockResolvedValue(reservation);

    const result = await service.findOne('reservation-uuid-1', 'driver-uuid');

    expect(result).toEqual(reservation);
    expect(prisma.reservation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'reservation-uuid-1' } }),
    );
  });

  it('throws NotFoundException when reservation does not exist', async () => {
    prisma.reservation.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('nonexistent-uuid', 'driver-uuid'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when driver does not own the reservation', async () => {
    prisma.reservation.findUnique.mockResolvedValue(
      makeReservation({ driverId: 'other-driver-uuid' }),
    );

    await expect(
      service.findOne('reservation-uuid-1', 'driver-uuid'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns reservation with slot and floor info included', async () => {
    const floor = makeFloor({ id: 2, floorNumber: 2, name: 'T2' });
    const slot = makeSlot({ id: 5, code: 'T2-B-05', floor });
    const reservation = makeReservation({ slot });
    prisma.reservation.findUnique.mockResolvedValue(reservation);

    const result = await service.findOne('reservation-uuid-1', 'driver-uuid');

    expect(result.slot.code).toBe('T2-B-05');
    expect(result.slot.floor.floorNumber).toBe(2);
  });
});
