import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { VehicleType, Zone, SlotStatus, SessionStatus, PaymentMethod } from '@prisma/client';
import { SessionsService } from './sessions.service';
import { AllocationService } from '../slots/allocation.service';
import { FeesService } from '../fees/fees.service';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleIdentificationService } from '../vehicle-identification/vehicle-identification.service';
import type { VehicleIdentityResult } from '../vehicle-identification/vehicle-identity.types';
import * as QRCode from 'qrcode';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,test-qr'),
}));

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
  zone: Zone.A,
  slotNumber: 1,
  code: 'T1-A-01',
  status: SlotStatus.available,
  vehicleType: VehicleType.car,
  walkingDistance: 20,
  floor: makeFloor(),
  ...overrides,
});

const makeSession = (overrides: Partial<{
  id: string; licensePlate: string; vehicleType: VehicleType;
  status: SessionStatus; qrCode: string | null; driverId: string | null;
  reservationId: string | null;
  sessionCode: string | null;
  ticketGeneratedAt: Date | null;
  ticketIssuedAt: Date | null;
  ticketIssuedByStaffId: string | null;
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
  sessionCode: 'PBMS-SESSION',
  ticketGeneratedAt: new Date('2024-01-01T08:00:00Z'),
  ticketIssuedAt: null,
  ticketIssuedByStaffId: null,
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
    parkingSession: { create: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    reservation: { findFirst: jest.Mock; findUnique: jest.Mock };
    ocrEvidence: { update: jest.Mock };
    slot: { update: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let allocationService: { allocate: jest.Mock };
  let feesService: { calculate: jest.Mock; preview: jest.Mock };
  let vehicleIdentificationService: { identifyForCheckIn: jest.Mock; identifyForCheckout: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      parkingSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      reservation: { findFirst: jest.fn(), findUnique: jest.fn() },
      ocrEvidence: { update: jest.fn() },
      slot: { update: jest.fn() },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };

    allocationService = { allocate: jest.fn() };
    feesService = { calculate: jest.fn(), preview: jest.fn() };
    vehicleIdentificationService = {
      identifyForCheckIn: jest.fn(),
      identifyForCheckout: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AllocationService, useValue: allocationService },
        { provide: FeesService, useValue: feesService },
        { provide: VehicleIdentificationService, useValue: vehicleIdentificationService },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── checkIn ───────────────────────────────────────────────────────────────

  describe('checkIn', () => {
    const staffId = 'staff-uuid';
    const slot = makeSlot();

    beforeEach(() => {
      // Default: no duplicate session
      prisma.parkingSession.findFirst.mockResolvedValue(null);

      // Default: no active reservation (findFirst path)
      prisma.reservation.findFirst.mockResolvedValue(null);

      // Default: no direct reservation (findUnique path for dto.reservationId)
      prisma.reservation.findUnique.mockResolvedValue(null);

      // Default: identification succeeds with MANUAL_PLATE
      vehicleIdentificationService.identifyForCheckIn.mockResolvedValue({
        source: 'MANUAL_PLATE',
        licensePlate: '59A-12345',
      } as VehicleIdentityResult);

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
          reservation: { update: jest.fn().mockResolvedValue({}) },
          parkingSession: {
            create: jest.fn().mockImplementation(({ data }) =>
              Promise.resolve(makeSession({
                id: data.id,
                qrCode: data.qrCode,
                sessionCode: data.sessionCode,
                ticketGeneratedAt: data.ticketGeneratedAt,
              })),
            ),
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
      expect(result.qr_code).toBe('data:image/png;base64,test-qr');
      expect(result.ticket.sessionCode).toBeDefined();
      expect(allocationService.allocate).toHaveBeenCalledWith(VehicleType.car);
    });

    it('links registered driver and generates QR code when driverPhone matches', async () => {
      const driverId = 'driver-uuid';
      prisma.user.findUnique.mockResolvedValue({ id: driverId, isActive: true });
      prisma.reservation.findFirst.mockResolvedValue(null);

      // Transaction returns session with qrCode set
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue(slot) },
          reservation: { update: jest.fn() },
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

      // Flow 3 still generates a Session QR for walk-in ticket issuance.
      expect(result.qr_code).toBe('data:image/png;base64,test-qr');
    });

    it('does not link driver when account is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'driver-uuid', isActive: false });

      const dto = {
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car,
        driverPhone: '0901234567',
      };

      const result = await service.checkIn(dto, staffId);

      expect(result.qr_code).toBe('data:image/png;base64,test-qr');
    });

    // Req 1.5: Building full
    it('throws ConflictException when building is full (allocation fails)', async () => {
      allocationService.allocate.mockRejectedValue(
        new ConflictException('No available slot for vehicle type: car'),
      );

      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      await expect(service.checkIn(dto, staffId)).rejects.toThrow(ConflictException);
    });

    it('logs duplicate active session rejection before check-in allocation', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      prisma.parkingSession.findFirst.mockResolvedValue(
        makeSession({ id: 'existing-session-uuid', licensePlate: '59A-12345' }),
      );

      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      await expect(service.checkIn(dto, staffId)).rejects.toThrow(ConflictException);
      expect(allocationService.allocate).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate active session rejected'),
      );
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
        allocationStrategy: 'fair_distance_based',
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
      expect(capturedData!['allocationStrategy']).toBe('fair_distance_based');
      expect(capturedData!['allocationTimeMs']).toBe(12);
      expect(capturedData!['checkedInById']).toBe(staffId);
    });

    it('maps DB duplicate active plate protection to ConflictException', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      prisma.parkingSession.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      await expect(service.checkIn(dto, staffId)).rejects.toThrow(ConflictException);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate active session rejected'),
      );
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

    it('links OCR evidence to the created session after staff confirms check-in', async () => {
      let txOcrEvidenceUpdate: unknown = null;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue(slot) },
          reservation: { update: jest.fn() },
          ocrEvidence: {
            update: jest.fn().mockImplementation((args) => {
              txOcrEvidenceUpdate = args;
              return Promise.resolve({});
            }),
          },
          parkingSession: {
            create: jest.fn().mockImplementation(({ data }) =>
              Promise.resolve(makeSession({
                id: data.id,
                qrCode: data.qrCode,
                sessionCode: data.sessionCode,
                ticketGeneratedAt: data.ticketGeneratedAt,
              })),
            ),
          },
        };
        return fn(tx);
      });

      await service.checkIn(
        {
          licensePlate: '59A-12345',
          vehicleType: VehicleType.car,
          ocrEvidenceId: 'ocr-evidence-uuid',
          identificationMethod: 'OCR',
          identificationConfidence: 0.92,
        } as any,
        staffId,
      );

      expect(txOcrEvidenceUpdate).toEqual(
        expect.objectContaining({
          where: { id: 'ocr-evidence-uuid' },
          data: expect.objectContaining({
            sessionId: expect.any(String),
            confirmedPlate: '59A-12345',
            vehicleType: VehicleType.car,
            staffId,
            reservationId: null,
            checkInTime: expect.any(Date),
          }),
        }),
      );
    });

    it('returns session ticket data for walk-in check-in', async () => {
      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };
      jest.mocked(QRCode.toDataURL).mockClear();

      const result = await service.checkIn(dto, staffId);

      expect(result.ticket).toMatchObject({
        sessionId: expect.any(String),
        sessionCode: expect.stringMatching(/^PBMS-/),
        qrCode: 'data:image/png;base64,test-qr',
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car,
        slotCode: 'T1-A-01',
        floorName: 'T1',
        floorNumber: 1,
        zone: Zone.A,
      });
      expect(result.ticket.qrPayload).toBe(result.ticket.sessionCode);
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        result.ticket.sessionCode,
        expect.any(Object),
      );
    });

    // ── Task 20: Reservation fulfillment ──────────────────────────────────

    it('fulfills active reservation instead of allocating new slot (Task 20)', async () => {
      const driverId = 'driver-uuid';
      const reservedSlot = makeSlot({ id: 5, code: 'T2-A-03', status: SlotStatus.reserved });
      const reservation = {
        id: 'reservation-uuid-1',
        driverId,
        slotId: 5,
        vehicleType: VehicleType.car,
        status: 'active',
        slot: reservedSlot,
      };

      prisma.user.findUnique.mockResolvedValue({ id: driverId, isActive: true });
      prisma.reservation.findFirst.mockResolvedValue(reservation);

      let txReservationUpdate: unknown = null;
      let txSlotStatus: string | null = null;
      let capturedSessionData: Record<string, unknown> | null = null;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 5, status: 'reserved' }]),
          slot: {
            update: jest.fn().mockImplementation((args) => {
              txSlotStatus = args.data.status;
              return Promise.resolve({ ...reservedSlot, status: 'occupied' });
            }),
          },
          reservation: {
            update: jest.fn().mockImplementation((args) => {
              txReservationUpdate = args;
              return Promise.resolve({});
            }),
          },
          parkingSession: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedSessionData = data;
              return Promise.resolve(makeSession({
                reservationId: 'reservation-uuid-1',
                allocationStrategy: 'reservation_fulfillment',
                allocationTimeMs: 0,
                driverId,
                slot: reservedSlot,
              }));
            }),
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

      // Should NOT call allocation service
      expect(allocationService.allocate).not.toHaveBeenCalled();

      // Reservation should be fulfilled
      expect((txReservationUpdate as any).where.id).toBe('reservation-uuid-1');
      expect((txReservationUpdate as any).data.status).toBe('fulfilled');

      // Slot should go from reserved → occupied
      expect(txSlotStatus).toBe('occupied');

      // Session should link to reservation
      expect(capturedSessionData!['reservationId']).toBe('reservation-uuid-1');
      expect(capturedSessionData!['allocationStrategy']).toBe('reservation_fulfillment');
      expect(capturedSessionData!['allocationTimeMs']).toBe(0);

      // Response includes reservationId
      expect(result.session.reservationId).toBe('reservation-uuid-1');
    });

    it('falls back to normal allocation when driver has no active reservation', async () => {
      const driverId = 'driver-uuid';
      prisma.user.findUnique.mockResolvedValue({ id: driverId, isActive: true });
      prisma.reservation.findFirst.mockResolvedValue(null);

      // Override transaction to return session with QR (driver is registered)
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id, status: 'available' }]),
          slot: { update: jest.fn().mockResolvedValue(slot) },
          reservation: { update: jest.fn() },
          parkingSession: {
            create: jest.fn().mockResolvedValue(
              makeSession({ driverId, qrCode: 'data:image/png;base64,abc', reservationId: null }),
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

      // Should call allocation service (normal flow)
      expect(allocationService.allocate).toHaveBeenCalledWith(VehicleType.car);
      expect(result.session.reservationId).toBeNull();
    });

    it('does not check reservation when no driverPhone provided (walk-in)', async () => {
      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      await service.checkIn(dto, staffId);

      // Should not query reservations for walk-in
      expect(prisma.reservation.findFirst).not.toHaveBeenCalled();
      expect(allocationService.allocate).toHaveBeenCalled();
    });

    // ── P0-A: Direct reservation ID from QR scan ────────────────────────

    it('fulfills reservation directly via dto.reservationId (P0-A)', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      const reservedSlot = makeSlot({ id: 7, code: 'T2-B-05', status: SlotStatus.reserved, zone: Zone.B, vehicleType: VehicleType.motorbike });
      const reservation = {
        id: 'reservation-direct-uuid',
        driverId: 'driver-uuid',
        slotId: 7,
        vehicleType: VehicleType.motorbike,
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        slot: reservedSlot,
      };

      // VehicleIdentificationService confirms the reservation QR
      vehicleIdentificationService.identifyForCheckIn.mockResolvedValue({
        source: 'RESERVATION_QR',
        reservationId: 'reservation-direct-uuid',
        licensePlate: '59B-99999',
      } as VehicleIdentityResult);

      prisma.reservation.findUnique.mockResolvedValue(reservation);

      let capturedSessionData: Record<string, unknown> | null = null;
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 7, status: 'reserved' }]),
          slot: { update: jest.fn().mockResolvedValue({ ...reservedSlot, status: 'occupied' }) },
          reservation: { update: jest.fn().mockResolvedValue({}) },
          parkingSession: {
            create: jest.fn().mockImplementation(({ data }) => {
              capturedSessionData = data;
              return Promise.resolve(makeSession({
                reservationId: 'reservation-direct-uuid',
                allocationStrategy: 'reservation_fulfillment',
                allocationTimeMs: 0,
                driverId: 'driver-uuid',
                slot: reservedSlot,
              }));
            }),
          },
        };
        return fn(tx);
      });

      const dto = {
        licensePlate: '59B-99999',
        vehicleType: VehicleType.motorbike,
        reservationId: 'reservation-direct-uuid',
      };

      const result = await service.checkIn(dto, staffId);

      // VehicleIdentificationService should have been called
      expect(vehicleIdentificationService.identifyForCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: 'reservation-direct-uuid' }),
      );
      expect(allocationService.allocate).not.toHaveBeenCalled();

      // Session should link to reservation
      expect(capturedSessionData!['reservationId']).toBe('reservation-direct-uuid');
      expect(capturedSessionData!['allocationStrategy']).toBe('reservation_fulfillment');
      expect(result.session.reservationId).toBe('reservation-direct-uuid');
      expect(result.session.identificationMethod).toBe('RESERVATION_QR');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Check-in with reservation success'),
      );
    });

    it('rejects check-in when dto.reservationId points to a non-active reservation (P0-A)', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      vehicleIdentificationService.identifyForCheckIn.mockResolvedValue({
        source: 'RESERVATION_QR',
        reservationId: 'expired-reservation',
        licensePlate: '59A-12345',
      } as VehicleIdentityResult);

      prisma.reservation.findUnique.mockResolvedValue({
        id: 'expired-reservation',
        driverId: 'driver-uuid',
        slotId: 3,
        vehicleType: VehicleType.car,
        status: 'expired',
        expiresAt: new Date(Date.now() - 60_000),
        slot: makeSlot(),
      });

      const dto = {
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car,
        reservationId: 'expired-reservation',
      };

      await expect(service.checkIn(dto, staffId)).rejects.toThrow(ConflictException);

      expect(allocationService.allocate).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Expired reservation check-in rejected'),
      );
    });

    it('rejects check-in when dto.reservationId vehicleType mismatches (P0-A)', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      vehicleIdentificationService.identifyForCheckIn.mockResolvedValue({
        source: 'RESERVATION_QR',
        reservationId: 'mismatch-reservation',
        licensePlate: '59A-12345',
      } as VehicleIdentityResult);

      prisma.reservation.findUnique.mockResolvedValue({
        id: 'mismatch-reservation',
        driverId: 'driver-uuid',
        slotId: 3,
        vehicleType: VehicleType.motorbike,
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        slot: makeSlot(),
      });

      const dto = {
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car, // mismatch with reservation's motorbike
        reservationId: 'mismatch-reservation',
      };

      await expect(service.checkIn(dto, staffId)).rejects.toThrow(ConflictException);

      expect(allocationService.allocate).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vehicle type mismatch rejected'),
      );
    });

    it('rejects check-in when dto.reservationId is active but expired by expiresAt (P0-A)', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      vehicleIdentificationService.identifyForCheckIn.mockResolvedValue({
        source: 'RESERVATION_QR',
        reservationId: 'past-active-reservation',
        licensePlate: '59A-12345',
      } as VehicleIdentityResult);

      prisma.reservation.findUnique.mockResolvedValue({
        id: 'past-active-reservation',
        driverId: 'driver-uuid',
        slotId: 3,
        vehicleType: VehicleType.car,
        status: 'active',
        expiresAt: new Date(Date.now() - 60_000),
        slot: makeSlot({ status: SlotStatus.reserved }),
      });

      const dto = {
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car,
        reservationId: 'past-active-reservation',
      };

      await expect(service.checkIn(dto, staffId)).rejects.toThrow(ConflictException);
      expect(allocationService.allocate).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Expired reservation check-in rejected'),
      );
    });

    // ── P0-B / P1-B: identificationMethod from identity source ─────────

    it('returns identificationMethod from VehicleIdentityResult source (P1-B)', async () => {
      vehicleIdentificationService.identifyForCheckIn.mockResolvedValue({
        source: 'OCR',
        licensePlate: '59A-12345',
        confidence: 0.95,
      } as VehicleIdentityResult);

      const dto = {
        licensePlate: '59A-12345',
        vehicleType: VehicleType.car,
        identificationConfidence: 0.95,
      };

      const result = await service.checkIn(dto, staffId);

      expect(result.session.identificationMethod).toBe('OCR');
    });

    it('returns MANUAL_PLATE as identificationMethod for plain plate input (P1-B)', async () => {
      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      const result = await service.checkIn(dto, staffId);

      expect(result.session.identificationMethod).toBe('MANUAL_PLATE');
    });

    it('delegates identification to VehicleIdentificationService on every checkIn (P1-B)', async () => {
      const dto = { licensePlate: '59A-12345', vehicleType: VehicleType.car };

      await service.checkIn(dto, staffId);

      expect(vehicleIdentificationService.identifyForCheckIn).toHaveBeenCalledTimes(1);
      expect(vehicleIdentificationService.identifyForCheckIn).toHaveBeenCalledWith({
        licensePlate: '59A-12345',
        reservationId: undefined,
        driverPhone: undefined,
        identificationConfidence: undefined,
      });
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

  // ── checkOut (15.1–15.3) ──────────────────────────────────────────────────

  describe('checkOut', () => {
    const staffId = 'staff-uuid';
    const sessionWithSlot = {
      ...makeSession(),
      slot: {
        ...makeSlot(),
        floor: makeFloor(),
      },
    };

    const mockBreakdown = {
      sessionId: 'session-uuid-1',
      vehicleType: VehicleType.car,
      checkInTime: new Date('2024-01-01T08:00:00Z'),
      checkOutTime: new Date('2024-01-01T10:30:00Z'),
      durationMs: 9000000,
      durationHours: 2.5,
      roundedHours: 3,
      hourlyRate: 8000,
      baseFee: 24000,
      isOvertime: false,
      overtimePenalty: 0,
      isLostTicket: false,
      lostTicketPenalty: 0,
      totalFee: 24000,
    };

    it('throws BadRequestException when neither sessionId nor licensePlate provided (15.1)', async () => {
      await expect(service.checkOut({}, staffId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('looks up session by sessionId (QR scan) (15.1)', async () => {
      prisma.parkingSession.findFirst.mockResolvedValue(sessionWithSlot);
      feesService.calculate.mockResolvedValue(mockBreakdown);

      const result = await service.checkOut({ sessionId: 'session-uuid-1' }, staffId);

      expect(prisma.parkingSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'active',
            OR: [{ id: 'session-uuid-1' }, { sessionCode: 'session-uuid-1' }],
          },
        }),
      );
      expect(result.session.id).toBe('session-uuid-1');
      expect(result.breakdown).toEqual(mockBreakdown);
    });

    it('looks up session by licensePlate (15.1)', async () => {
      prisma.parkingSession.findFirst.mockResolvedValue(sessionWithSlot);
      feesService.calculate.mockResolvedValue(mockBreakdown);

      const result = await service.checkOut({ licensePlate: '59A-12345' }, staffId);

      expect(prisma.parkingSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'active', licensePlate: '59A-12345' },
        }),
      );
      expect(result.session.licensePlate).toBe('59A-12345');
    });

    it('looks up session by friendly sessionCode from Session QR', async () => {
      prisma.parkingSession.findFirst.mockResolvedValue(sessionWithSlot);
      feesService.calculate.mockResolvedValue(mockBreakdown);

      const result = await service.checkOut({ sessionId: 'PBMS-SESSION' }, staffId);

      expect(prisma.parkingSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'active',
            OR: [{ id: 'PBMS-SESSION' }, { sessionCode: 'PBMS-SESSION' }],
          },
        }),
      );
      expect(result.session.id).toBe('session-uuid-1');
    });

    it('throws NotFoundException when no active session found', async () => {
      prisma.parkingSession.findFirst.mockResolvedValue(null);

      await expect(
        service.checkOut({ licensePlate: '00X-00000' }, staffId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns fee breakdown from FeesService (15.2)', async () => {
      prisma.parkingSession.findFirst.mockResolvedValue(sessionWithSlot);
      feesService.calculate.mockResolvedValue(mockBreakdown);

      const result = await service.checkOut({ sessionId: 'session-uuid-1' }, staffId);

      expect(feesService.calculate).toHaveBeenCalledWith(
        sessionWithSlot,
        false,
        expect.any(Date),
      );
      expect(result.breakdown.totalFee).toBe(24000);
    });

    it('logs warning when overtime detected (15.3)', async () => {
      prisma.parkingSession.findFirst.mockResolvedValue(sessionWithSlot);
      feesService.calculate.mockResolvedValue({
        ...mockBreakdown,
        isOvertime: true,
        overtimePenalty: 50000,
        roundedHours: 25,
        totalFee: 250000,
      });

      const loggerSpy = jest.spyOn((service as any).logger, 'warn');

      await service.checkOut({ sessionId: 'session-uuid-1' }, staffId);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Overtime detected'),
      );
    });

    it('returns session and slot info in response', async () => {
      prisma.parkingSession.findFirst.mockResolvedValue(sessionWithSlot);
      feesService.calculate.mockResolvedValue(mockBreakdown);

      const result = await service.checkOut({ sessionId: 'session-uuid-1' }, staffId);

      expect(result.session).toHaveProperty('id');
      expect(result.session).toHaveProperty('licensePlate');
      expect(result.session).toHaveProperty('vehicleType');
      expect(result.session).toHaveProperty('checkInTime');
      expect(result.slot).toHaveProperty('code');
      expect(result.slot).toHaveProperty('floor');
    });
  });

  // ── confirmPayment (15.4–15.6) ────────────────────────────────────────────

  describe('confirmPayment', () => {
    const staffId = 'staff-uuid';
    const sessionWithSlot = {
      ...makeSession(),
      slotId: 1,
      slot: {
        ...makeSlot(),
        floor: makeFloor(),
      },
    };

    const mockBreakdown = {
      sessionId: 'session-uuid-1',
      vehicleType: VehicleType.car,
      checkInTime: new Date('2024-01-01T08:00:00Z'),
      checkOutTime: new Date('2024-01-01T10:30:00Z'),
      durationMs: 9000000,
      durationHours: 2.5,
      roundedHours: 3,
      hourlyRate: 8000,
      baseFee: 24000,
      isOvertime: false,
      overtimePenalty: 0,
      isLostTicket: false,
      lostTicketPenalty: 0,
      totalFee: 24000,
    };

    beforeEach(() => {
      prisma.parkingSession.findUnique.mockResolvedValue(sessionWithSlot);
      feesService.calculate.mockResolvedValue(mockBreakdown);

      // Transaction executes callback
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          parkingSession: {
            update: jest.fn().mockResolvedValue({ ...sessionWithSlot, status: 'completed' }),
          },
          payment: {
            create: jest.fn().mockResolvedValue({
              id: 'payment-uuid-1',
              sessionId: 'session-uuid-1',
              amount: 24000,
              method: PaymentMethod.cash,
              paidAt: new Date('2024-01-01T10:30:00Z'),
              receivedBy: staffId,
            }),
          },
          slot: { update: jest.fn().mockResolvedValue({ id: 1, status: 'available' }) },
        };
        return fn(tx);
      });
    });

    it('throws NotFoundException when session not found', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmPayment('nonexistent', {}, staffId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when session is already completed', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue({
        ...sessionWithSlot,
        status: SessionStatus.completed,
      });

      await expect(
        service.confirmPayment('session-uuid-1', {}, staffId),
      ).rejects.toThrow(ConflictException);
    });

    it('calculates fee with lost ticket flag (15.4)', async () => {
      const lostBreakdown = {
        ...mockBreakdown,
        isLostTicket: true,
        lostTicketPenalty: 100000,
        totalFee: 124000,
      };
      feesService.calculate.mockResolvedValue(lostBreakdown);

      const result = await service.confirmPayment(
        'session-uuid-1',
        { isLostTicket: true },
        staffId,
      );

      expect(feesService.calculate).toHaveBeenCalledWith(
        sessionWithSlot,
        true,
        expect.any(Date),
      );
      expect(result.receipt.breakdown.isLostTicket).toBe(true);
      expect(result.receipt.breakdown.lostTicketPenalty).toBe(100000);
    });

    it('creates Payment record and releases slot in transaction (15.4, 15.5)', async () => {
      let txCalls: { sessionUpdate: unknown; paymentCreate: unknown; slotUpdate: unknown } | null = null;

      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          parkingSession: {
            update: jest.fn().mockImplementation((args) => {
              txCalls = txCalls || {} as any;
              (txCalls as any).sessionUpdate = args;
              return Promise.resolve({ ...sessionWithSlot, status: 'completed' });
            }),
          },
          payment: {
            create: jest.fn().mockImplementation((args) => {
              txCalls = txCalls || {} as any;
              (txCalls as any).paymentCreate = args;
              return Promise.resolve({
                id: 'payment-uuid-1',
                sessionId: 'session-uuid-1',
                amount: 24000,
                method: PaymentMethod.cash,
                paidAt: new Date(),
                receivedBy: staffId,
              });
            }),
          },
          slot: {
            update: jest.fn().mockImplementation((args) => {
              txCalls = txCalls || {} as any;
              (txCalls as any).slotUpdate = args;
              return Promise.resolve({ id: 1, status: 'available' });
            }),
          },
        };
        return fn(tx);
      });

      await service.confirmPayment('session-uuid-1', {}, staffId);

      // Session marked completed with fees
      expect((txCalls as any).sessionUpdate.data.status).toBe('completed');
      expect((txCalls as any).sessionUpdate.data.isPaid).toBe(true);
      expect((txCalls as any).sessionUpdate.data.feeAmount).toBe(24000);
      expect((txCalls as any).sessionUpdate.data.checkedOutById).toBe(staffId);

      // Payment created
      expect((txCalls as any).paymentCreate.data.sessionId).toBe('session-uuid-1');
      expect((txCalls as any).paymentCreate.data.amount).toBe(24000);
      expect((txCalls as any).paymentCreate.data.method).toBe(PaymentMethod.cash);
      expect((txCalls as any).paymentCreate.data.receivedBy).toBe(staffId);

      // Slot released
      expect((txCalls as any).slotUpdate.data.status).toBe('available');
      expect((txCalls as any).slotUpdate.where.id).toBe(1);
    });

    it('returns receipt with full breakdown (15.6)', async () => {
      const result = await service.confirmPayment('session-uuid-1', {}, staffId);

      expect(result.receipt).toHaveProperty('sessionId', 'session-uuid-1');
      expect(result.receipt).toHaveProperty('licensePlate', '59A-12345');
      expect(result.receipt).toHaveProperty('vehicleType', VehicleType.car);
      expect(result.receipt).toHaveProperty('checkInTime');
      expect(result.receipt).toHaveProperty('checkOutTime');
      expect(result.receipt).toHaveProperty('durationHours', 3);
      expect(result.receipt.breakdown).toHaveProperty('hourlyRate', 8000);
      expect(result.receipt.breakdown).toHaveProperty('baseFee', 24000);
      expect(result.receipt.breakdown).toHaveProperty('totalFee', 24000);
      expect(result.receipt.payment).toHaveProperty('id', 'payment-uuid-1');
      expect(result.receipt.payment).toHaveProperty('method', PaymentMethod.cash);
    });

    it('uses provided payment method', async () => {
      // PaymentMethod only has 'cash' for now, but test the pass-through
      const result = await service.confirmPayment(
        'session-uuid-1',
        { method: PaymentMethod.cash },
        staffId,
      );

      expect(result.receipt.payment.method).toBe(PaymentMethod.cash);
    });
  });

  describe('issueTicket', () => {
    const staffId = 'staff-uuid';

    it('stores ticketIssuedAt and ticketIssuedByStaffId for a session ticket', async () => {
      prisma.parkingSession.update.mockResolvedValue({
        ...makeSession(),
        ticketIssuedAt: new Date('2026-06-13T03:00:00Z'),
        ticketIssuedByStaffId: staffId,
      });

      const result = await service.issueTicket('session-uuid-1', staffId);

      expect(prisma.parkingSession.update).toHaveBeenCalledWith({
        where: { id: 'session-uuid-1' },
        data: {
          ticketIssuedAt: expect.any(Date),
          ticketIssuedByStaffId: staffId,
        },
      });
      expect(result).toMatchObject({
        sessionId: 'session-uuid-1',
        ticketIssuedByStaffId: staffId,
      });
      expect(result.ticketIssuedAt).toBeDefined();
    });
  });
});
