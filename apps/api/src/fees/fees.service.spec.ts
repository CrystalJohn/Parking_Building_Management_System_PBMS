import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VehicleType, SessionStatus } from '@prisma/client';
import { FeesService } from './fees.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makePricing = (
  overrides: Partial<{
    id: number;
    vehicleType: VehicleType;
    hourlyRate: number;
    overtimePenalty: number;
    lostTicketPenalty: number;
    overtimeThresholdHours: number;
  }> = {},
) => ({
  id: 1,
  vehicleType: VehicleType.car,
  hourlyRate: 20000,
  overtimePenalty: 50000,
  lostTicketPenalty: 100000,
  overtimeThresholdHours: 24,
  updatedAt: new Date(),
  updatedBy: null,
  ...overrides,
});

const makeSession = (
  overrides: Partial<{
    id: string;
    vehicleType: VehicleType;
    vehicleId: string | null;
    checkInTime: Date;
    checkOutTime: Date | null;
    status: SessionStatus;
  }> = {},
) => ({
  id: 'session-uuid-1',
  vehicleType: VehicleType.car,
  vehicleId: null,
  checkInTime: new Date('2024-01-01T08:00:00Z'),
  checkOutTime: null,
  status: SessionStatus.active,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FeesService', () => {
  let service: FeesService;
  let prisma: {
    pricingConfig: { findFirst: jest.Mock };
    parkingSession: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      pricingConfig: { findFirst: jest.fn() },
      parkingSession: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FeesService>(FeesService);
  });

  // ─── calculate() ─────────────────────────────────────────────────────────

  describe('calculate()', () => {
    it('should round up partial hours (14.2)', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      // 2h 15min parked → should round to 3h
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:15:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, false);

      expect(result.durationHours).toBeCloseTo(2.25, 2);
      expect(result.roundedHours).toBe(3);
      expect(result.baseFee).toBe(3 * 20000); // 60000
      expect(result.totalFee).toBe(60000);
    });

    it('should not round up exact hours', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      // Exactly 2h
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:00:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, false);

      expect(result.roundedHours).toBe(2);
      expect(result.baseFee).toBe(2 * 20000); // 40000
      expect(result.totalFee).toBe(40000);
    });

    it('should charge minimum 1 hour for sub-hour parking', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      // 10 minutes
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T08:10:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, false);

      expect(result.roundedHours).toBe(1);
      expect(result.baseFee).toBe(20000);
      expect(result.totalFee).toBe(20000);
    });

    it('should add overtime penalty when > 24h (14.3)', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      // 25h parked
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-02T09:00:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, false);

      expect(result.roundedHours).toBe(25);
      expect(result.isOvertime).toBe(true);
      expect(result.overtimePenalty).toBe(50000);
      expect(result.baseFee).toBe(25 * 20000); // 500000
      expect(result.totalFee).toBe(500000 + 50000); // 550000
    });

    it('should NOT add overtime penalty at exactly 24h', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      // Exactly 24h
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-02T08:00:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, false);

      expect(result.roundedHours).toBe(24);
      expect(result.isOvertime).toBe(false);
      expect(result.overtimePenalty).toBe(0);
      expect(result.totalFee).toBe(24 * 20000); // 480000
    });

    it('should add lost ticket penalty when flagged (14.4)', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      // 2h + lost ticket
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:00:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, true);

      expect(result.isLostTicket).toBe(true);
      expect(result.lostTicketPenalty).toBe(100000);
      expect(result.totalFee).toBe(40000 + 100000); // 140000
    });

    it('should combine overtime + lost ticket penalties', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      // 25h + lost ticket
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-02T09:00:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, true);

      expect(result.isOvertime).toBe(true);
      expect(result.isLostTicket).toBe(true);
      expect(result.totalFee).toBe(25 * 20000 + 50000 + 100000); // 650000
    });

    it('should use motorbike rate from PricingConfig (14.5)', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(
        makePricing({
          vehicleType: VehicleType.motorbike,
          hourlyRate: 10000,
        }),
      );

      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T11:00:00Z');
      const session = makeSession({
        vehicleType: VehicleType.motorbike,
        checkInTime: checkIn,
        checkOutTime: checkOut,
      });

      const result = await service.calculate(session, false);

      expect(result.hourlyRate).toBe(10000);
      expect(result.roundedHours).toBe(3);
      expect(result.totalFee).toBe(30000);
    });

    it('should use provided checkOutTime override when session has no checkOutTime', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      const checkIn = new Date('2024-01-01T08:00:00Z');
      const overrideCheckOut = new Date('2024-01-01T12:00:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: null });

      const result = await service.calculate(session, false, overrideCheckOut);

      expect(result.checkOutTime).toEqual(overrideCheckOut);
      expect(result.roundedHours).toBe(4);
      expect(result.totalFee).toBe(80000);
    });

    it('should throw NotFoundException when PricingConfig missing', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(null);

      const session = makeSession();

      await expect(service.calculate(session, false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── preview() ───────────────────────────────────────────────────────────

  describe('preview()', () => {
    it('should look up session and calculate fee (14.6)', async () => {
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const sessionData = makeSession({ checkInTime: checkIn });
      prisma.parkingSession.findUnique.mockResolvedValue(sessionData);
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      // Mock Date.now for consistent "now" calculation
      const mockNow = new Date('2024-01-01T10:30:00Z');
      jest.useFakeTimers().setSystemTime(mockNow);

      const result = await service.preview('session-uuid-1', false);

      expect(prisma.parkingSession.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-uuid-1' },
        select: {
          id: true,
          vehicleType: true,
          vehicleId: true,
          checkInTime: true,
          checkOutTime: true,
          status: true,
        },
      });
      expect(result.roundedHours).toBe(3); // 2.5h → ceil → 3
      expect(result.baseFee).toBe(60000);

      jest.useRealTimers();
    });

    it('should throw NotFoundException when session not found', async () => {
      prisma.parkingSession.findUnique.mockResolvedValue(null);

      await expect(service.preview('non-existent', false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should pass isLost flag to calculate', async () => {
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:00:00Z');
      const sessionData = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });
      prisma.parkingSession.findUnique.mockResolvedValue(sessionData);
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());

      const result = await service.preview('session-uuid-1', true);

      expect(result.isLostTicket).toBe(true);
      expect(result.lostTicketPenalty).toBe(100000);
    });
  });
});
