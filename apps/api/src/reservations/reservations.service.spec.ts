import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ReservationStatus,
  SlotStatus,
  VehicleType,
  Zone,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ReservationsService } from './reservations.service';
import { AllocationService } from '../slots/allocation.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const makeFloor = (overrides: Partial<{ id: number; floorNumber: number; name: string }> = {}) => ({
  id: 1,
  floorNumber: 1,
  name: 'T1',
  ...overrides,
});

const makeSlot = (overrides: Partial<{
  id: number;
  floorId: number;
  zone: Zone;
  slotNumber: number;
  code: string;
  status: SlotStatus;
  vehicleType: VehicleType;
  walkingDistance: number;
  floor: ReturnType<typeof makeFloor>;
}> = {}) => ({
  id: 1,
  floorId: 1,
  zone: Zone.A,
  slotNumber: 1,
  code: 'T1-A-01',
  status: SlotStatus.available,
  vehicleType: VehicleType.car,
  walkingDistance: 10,
  floor: makeFloor(),
  ...overrides,
});

const makeReservation = (overrides: Partial<{
  id: string;
  driverId: string;
  slotId: number;
  vehicleId: string | null;
  vehicleType: VehicleType;
  plannedArrivalAt: Date | null;
  status: ReservationStatus;
  createdAt: Date;
  expiresAt: Date;
  slot: ReturnType<typeof makeSlot>;
  driver: { fullName: string | null; phone: string | null };
  vehicle: { id: string; plateNumber: string; vehicleType: VehicleType } | null;
}> = {}) => ({
  id: 'reservation-uuid-1',
  driverId: 'driver-uuid',
  slotId: 1,
  vehicleId: 'vehicle-uuid-1',
  vehicleType: VehicleType.car,
  plannedArrivalAt: new Date('2026-06-29T03:00:00.000Z'),
  status: ReservationStatus.active,
  createdAt: new Date('2026-06-29T02:00:00.000Z'),
  expiresAt: new Date('2026-06-29T04:00:00.000Z'),
  slot: makeSlot(),
  driver: { fullName: 'Driver One', phone: '0900000000' },
  vehicle: {
    id: 'vehicle-uuid-1',
    plateNumber: '59A12345',
    vehicleType: VehicleType.car,
  },
  ...overrides,
});

const makeCreateDto = (
  overrides: Partial<{
    vehicleId: string;
    plannedArrivalAt: string;
  }> = {},
) => ({
  vehicleId: 'vehicle-uuid-1',
  plannedArrivalAt: '2026-06-29T03:00:00.000Z',
  ...overrides,
});

describe('ReservationsService', () => {
  let service: ReservationsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    vehicle: { findFirst: jest.Mock };
    reservation: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    systemConfig: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let allocationService: { allocate: jest.Mock };
  let jwtService: { signAsync: jest.Mock };

  function makeTx(overrides: Record<string, unknown> = {}) {
    return {
      reservation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args) =>
          Promise.resolve(
            makeReservation({
              vehicleType: args.data.vehicleType,
              plannedArrivalAt: args.data.plannedArrivalAt,
              expiresAt: args.data.expiresAt,
              slotId: args.data.slotId,
              vehicleId: args.data.vehicleId,
            }),
          ),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      slot: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 1, status: 'available' }]),
      systemConfig: {
        findUnique: jest.fn().mockResolvedValue({
          configKey: 'reservation_timeout_minutes',
          configValue: '60',
        }),
      },
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      vehicle: { findFirst: jest.fn() },
      reservation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      systemConfig: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    allocationService = { allocate: jest.fn() };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AllocationService, useValue: allocationService },
        { provide: JwtService, useValue: jwtService },
        { provide: NotificationsService, useValue: { createForUser: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
    prisma.user.findUnique.mockResolvedValue({
      id: 'driver-uuid',
      role: 'driver',
      isActive: true,
    });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-uuid-1',
      plateNumber: '59A12345',
      vehicleType: VehicleType.car,
    });
    allocationService.allocate.mockResolvedValue({
      slot: makeSlot(),
      allocationStrategy: 'balanced_occupancy',
      allocationTimeMs: 1,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(makeTx()),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('create()', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-29T02:00:00.000Z'));
    });

    it('creates a short-term reservation and holds the slot as reserved', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (txArg: unknown) => Promise<unknown>) =>
        fn(tx),
      );

      const result = await service.create(makeCreateDto(), 'driver-uuid');

      expect(result.reservation.expiresAt.toISOString()).toBe(
        '2026-06-29T04:00:00.000Z',
      );
      expect(result.slot.code).toBe('T1-A-01');
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.slot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'reserved' },
      });
      expect(allocationService.allocate).toHaveBeenCalledWith(
        VehicleType.car,
        undefined,
        tx,
        expect.any(Set),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reservation created'),
      );
    });

    it('uses Serializable isolation for count, allocation, and create', async () => {
      await service.create(makeCreateDto(), 'driver-uuid');

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    });

    it('rejects unavailable physical slots with 409', async () => {
      allocationService.allocate.mockRejectedValue(
        new ConflictException('No available slot for vehicle type: car'),
      );

      await expect(
        service.create(makeCreateDto(), 'driver-uuid'),
      ).rejects.toThrow(ConflictException);
    });

    it('maps duplicate active reservation to 409 before allocation', async () => {
      const tx = makeTx({
        reservation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
          create: jest.fn(),
          update: jest.fn(),
        },
      });
      prisma.$transaction.mockImplementation(async (fn: (txArg: unknown) => Promise<unknown>) =>
        fn(tx),
      );

      await expect(
        service.create(makeCreateDto(), 'driver-uuid'),
      ).rejects.toThrow(ConflictException);
      expect(allocationService.allocate).not.toHaveBeenCalled();
    });

    it('maps DB unique violation from partial unique index to 409', async () => {
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create(makeCreateDto(), 'driver-uuid'),
      ).rejects.toThrow(ConflictException);
    });

    it('retries serializable transactions on P2034', async () => {
      const tx = makeTx();
      prisma.$transaction
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce(async (fn: (txArg: unknown) => Promise<unknown>) =>
          fn(tx),
        );

      await service.create(makeCreateDto(), 'driver-uuid');

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid plannedArrivalAt', async () => {
      await expect(
        service.create(
          makeCreateDto({ plannedArrivalAt: 'not-a-date' }),
          'driver-uuid',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects plannedArrivalAt in the past', async () => {
      await expect(
        service.create(
          makeCreateDto({ plannedArrivalAt: '2026-06-29T01:59:00.000Z' }),
          'driver-uuid',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects plannedArrivalAt more than 2 hours ahead', async () => {
      await expect(
        service.create(
          makeCreateDto({ plannedArrivalAt: '2026-06-29T04:01:00.000Z' }),
          'driver-uuid',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('retries the next candidate when the selected slot cannot be locked', async () => {
      const tx = makeTx();
      const firstSlot = makeSlot({ id: 1, code: 'T1-A-01' });
      const secondSlot = makeSlot({ id: 2, code: 'T1-A-02', slotNumber: 2 });
      allocationService.allocate
        .mockResolvedValueOnce({
          slot: firstSlot,
          allocationStrategy: 'balanced_occupancy',
          allocationTimeMs: 1,
        })
        .mockResolvedValueOnce({
          slot: secondSlot,
          allocationStrategy: 'balanced_occupancy',
          allocationTimeMs: 1,
        });
      tx.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 2, status: 'available' }]);
      prisma.$transaction.mockImplementation(async (fn: (txArg: unknown) => Promise<unknown>) =>
        fn(tx),
      );

      await service.create(makeCreateDto(), 'driver-uuid');

      expect(allocationService.allocate).toHaveBeenCalledTimes(2);
      expect(tx.slot.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { status: 'reserved' },
      });
    });

    it('returns 409 when every candidate lock attempt is lost', async () => {
      const tx = makeTx();
      tx.$queryRaw.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (fn: (txArg: unknown) => Promise<unknown>) =>
        fn(tx),
      );

      await expect(
        service.create(makeCreateDto(), 'driver-uuid'),
      ).rejects.toThrow(ConflictException);
      expect(allocationService.allocate).toHaveBeenCalledTimes(3);
    });

    it('throws ForbiddenException when user is not an active driver', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'driver-uuid',
        role: 'staff',
        isActive: true,
      });

      await expect(
        service.create(makeCreateDto(), 'driver-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findMyReservations()', () => {
    it('returns reservations for the given driver', async () => {
      const reservations = [makeReservation(), makeReservation({ id: 'reservation-2' })];
      prisma.reservation.findMany.mockResolvedValue(reservations);

      const result = await service.findMyReservations('driver-uuid');

      expect(result).toEqual(
        reservations.map((reservation) =>
          expect.objectContaining({
            id: reservation.id,
            vehicleId: reservation.vehicleId,
            licensePlate: reservation.vehicle?.plateNumber ?? null,
          }),
        ),
      );
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId: 'driver-uuid' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('findOne()', () => {
    it('returns the reservation when driver owns it', async () => {
      const reservation = makeReservation();
      prisma.reservation.findUnique.mockResolvedValue(reservation);

      const result = await service.findOne('reservation-uuid-1', 'driver-uuid');

      expect(result).toEqual(
        expect.objectContaining({
          id: reservation.id,
          vehicleId: reservation.vehicleId,
          licensePlate: reservation.vehicle?.plateNumber ?? null,
        }),
      );
    });

    it('throws NotFoundException when reservation does not exist', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('missing', 'driver-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when driver does not own the reservation (BOLA)', async () => {
      prisma.reservation.findUnique.mockResolvedValue(
        makeReservation({ driverId: 'other-driver' }),
      );

      await expect(
        service.findOne('reservation-uuid-1', 'driver-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancel()', () => {
    it('cancels reservation and releases the reserved slot', async () => {
      prisma.reservation.findUnique.mockResolvedValue(makeReservation());
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (txArg: unknown) => Promise<unknown>) =>
        fn(tx),
      );

      const result = await service.cancel('reservation-uuid-1', 'driver-uuid');

      expect(result.message).toContain('cancelled');
      expect(tx.reservation.update).toHaveBeenCalledWith({
        where: { id: 'reservation-uuid-1' },
        data: { status: 'cancelled' },
      });
      expect(tx.slot.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: 'reserved' },
        data: { status: 'available' },
      });
    });
  });

  describe('handleExpiredReservations()', () => {
    it('expires reservations and releases reserved slots', async () => {
      prisma.reservation.findMany.mockResolvedValue([
        { id: 'res-1', slotId: 1 },
        { id: 'res-2', slotId: 2 },
      ]);
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (txArg: unknown) => Promise<unknown>) =>
        fn(tx),
      );

      await service.handleExpiredReservations();

      expect(tx.reservation.update).toHaveBeenCalledTimes(2);
      expect(tx.reservation.update).toHaveBeenCalledWith({
        where: { id: 'res-1' },
        data: { status: 'expired' },
      });
      expect(tx.slot.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: 'reserved' },
        data: { status: 'available' },
      });
    });
  });
});

