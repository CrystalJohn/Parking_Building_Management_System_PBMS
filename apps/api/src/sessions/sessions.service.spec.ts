import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VehicleType, Zone, SlotStatus, SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';
import { AllocationService } from '../slots/allocation.service';
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
  floor: ReturnType<typeof makeFloor>;
}> = {}) => ({
  id: 1,
  floorId: 1,
  zone: Zone.A,
  slotNumber: 1,
  code: 'T1-A-01',
  status: SlotStatus.available,
  vehicleType: VehicleType.car,
  floor: makeFloor(),
  ...overrides,
});

const makeSession = (overrides: Partial<{
  id: string; licensePlate: string; vehicleType: VehicleType;
  status: SessionStatus; qrCode: string | null; driverId: string | null;
  allocationStrategy: string; allocationTimeMs: number;
  slot: ReturnType<typeof makeSlot>;
  driver: { id: string; phone: string; fullName: string | null } | null;
  checkedInBy: { id: string; phone: string; fullName: string | null } | null;
}> = {}) => ({
  id: 'session-uuid-1',
  licensePlate: '59A-12345',
  vehicleType: VehicleType.car,
  status: SessionStatus.active,
  qrCode: null,
  driverId: null,
  checkInTime: new Date('2024-01-01T08:00:00Z'),
  checkOutTime: null,
  slotId: 1,
  reservationId: null,
  feeAmount: 0,
  penaltyAmount: 0,
  isPaid: false,
  isOvertime: false,
  isLostTicket: false,
  idCardNo: null,
  driverLicenseNo: null,
  isSynthetic: false,
  checkedInById: 'staff-uuid',
  checkedOutById: null,
  allocationStrategy: 'balanced_occupancy',
  allocationTimeMs: 5,
  slot: makeSlot(),
  driver: null,
  checkedInBy: { id: 'staff-uuid', phone: '0900000001', fullName: 'Staff A' },
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    parkingSession: { create: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
    slot: { update: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let allocationService: { allocate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      parkingSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      slot: { update: jest.fn() },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };

    allocationService = { allocate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AllocationService, useValue: allocationService },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  // ── checkIn ───────────────────────────────────────────────────────────────

  describe('checkIn', () => {
    const staffId = 'staff-uuid';
    const slot = makeSlot();

    beforeEach(() => {
      // Default: allocation succeeds
      allocationService.allocate.mockResolvedValue({
        slot,
        allocationStrategy: 'balanced_occupancy',
        allocationTimeMs: 5,
      });

      // Default: transaction executes the callback
      prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue(slot) },
          parkingSession: {
            create: jest.fn().mockResolvedValue(makeSession()),
          },
        };
        return fn(tx as unknown as typeof prisma);
      });
    });

    it('creates a session for a walk-in driver (no driverPhone)', async () => {
      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      const result = await service.checkIn(dto, staffId);

      expect(result.session).toBeDefined();
      expect(result.slot).toBeDefined();
      expect(result.qr_code).toBeNull();
      expect(allocationService.allocate).toHaveBeenCalledWith(VehicleType.car);
    });

    it('links registered driver and generates QR code when driverPhone matches', async () => {
      const driverId = 'driver-uuid';
      prisma.user.findUnique.mockResolvedValue({ id: driverId, isActive: true });

      // Transaction returns session with qrCode set
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue(slot) },
          parkingSession: {
            create: jest.fn().mockResolvedValue(
              makeSession({ qrCode: 'data:image/png;base64,abc123', driverId }),
            ),
          },
        };
        return fn(tx);
      });

      const dto = {
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car,
        driverPhone: '0901234567',
      };

      const result = await service.checkIn(dto, staffId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '0901234567' },
        select: { id: true, isActive: true },
      });
      expect(result.qr_code).toBe('data:image/png;base64,abc123');
    });

    it('does not link driver when phone not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const dto = {
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car,
        driverPhone: '0999999999',
      };

      const result = await service.checkIn(dto, staffId);

      // No QR code since driver not found
      expect(result.qr_code).toBeNull();
    });

    it('does not link driver when account is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'driver-uuid', isActive: false });

      const dto = {
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car,
        driverPhone: '0901234567',
      };

      const result = await service.checkIn(dto, staffId);

      expect(result.qr_code).toBeNull();
    });

    // Req 1.5: Building full
    it('throws ConflictException when building is full (allocation fails)', async () => {
      allocationService.allocate.mockRejectedValue(
        new ConflictException('No available slot for vehicle type: car'),
      );

      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      await expect(service.checkIn(dto, staffId)).rejects.toThrow(ConflictException);
    });

    // Concurrency: slot taken between allocation and transaction
    it('throws ConflictException when slot is taken between allocation and transaction lock', async () => {
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          // FOR UPDATE SKIP LOCKED returns empty — slot was taken
          $queryRaw: jest.fn().mockResolvedValue([]),
          slot: { update: jest.fn() },
          parkingSession: { create: jest.fn() },
        };
        return fn(tx);
      });

      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      await expect(service.checkIn(dto, staffId)).rejects.toThrow(ConflictException);
    });

    // 13.5: Allocation metadata is logged
    it('logs allocationStrategy and allocationTimeMs in the session', async () => {
      allocationService.allocate.mockResolvedValue({
        slot,
        allocationStrategy: 'balanced_occupancy',
        allocationTimeMs: 12,
      });

      let capturedData: Record<string, unknown> | null = null;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn() },
          parkingSession: {
            create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
              capturedData = data;
              return Promise.resolve(makeSession({
                allocationStrategy: data.allocationStrategy as string,
                allocationTimeMs: data.allocationTimeMs as number,
              }));
            }),
          },
        };
        return fn(tx);
      });

      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };
      await service.checkIn(dto, staffId);

      expect(capturedData).not.toBeNull();
      expect(capturedData!['allocationStrategy']).toBe('balanced_occupancy');
      expect(capturedData!['allocationTimeMs']).toBe(12);
      expect(capturedData!['checkedInById']).toBe(staffId);
    });

    // 13.6: Response shape
    it('returns session, slot, and qr_code fields', async () => {
      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      const result = await service.checkIn(dto, staffId);

      expect(result).toHaveProperty('session');
      expect(result).toHaveProperty('slot');
      expect(result).toHaveProperty('qr_code');
      expect(result.session).toHaveProperty('id');
      expect(result.session).toHaveProperty('licensePlate');
      expect(result.session).toHaveProperty('vehicleType');
      expect(result.session).toHaveProperty('checkInTime');
      expect(result.slot).toHaveProperty('code');
      expect(result.slot).toHaveProperty('floor');
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns session when found', async () => {
      const session = makeSession();
      prisma.parkingSession.findUnique.mockResolvedValue(session);

      const result = await service.findOne('session-uuid-1');

      expect(result).toEqual(session);
      expect(prisma.parkingSession.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'session-uuid-1' } }),
      );
    });

    it('throws NotFoundException when session not found', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findActive ────────────────────────────────────────────────────────────

  describe('findActive', () => {
    it('returns only active sessions ordered by checkInTime', async () => {
      const sessions = [makeSession(), makeSession({ id: 'session-uuid-2' })];
      prisma.parkingSession.findMany.mockResolvedValue(sessions);

      const result = await service.findActive();

      expect(result).toEqual(sessions);
      expect(prisma.parkingSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'active' },
          orderBy: { checkInTime: 'asc' },
        }),
      );
    });
  });
});
