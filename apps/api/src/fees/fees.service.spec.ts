import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VehicleType, SessionStatus } from '@prisma/client';
import { FeesService, FeeBreakdown } from './fees.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingResolver } from '../config-mgmt/pricing-resolver.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makePricing = (
  overrides: Partial<{
    id: number;
    vehicleType: VehicleType;
    overtimePenalty: number;
    lostTicketPenalty: number;
    overtimeThresholdHours: number;
    reservationDiscountPercent: number;
  }> = {},
) => ({
  id: 1,
  vehicleType: VehicleType.car,
  overtimePenalty: 50000,
  lostTicketPenalty: 100000,
  overtimeThresholdHours: 24,
  reservationDiscountPercent: 20,
  ...overrides,
});

const makeSession = (
  overrides: Partial<{
    id: string;
    vehicleType: VehicleType;
    vehicleId: string | null;
    reservationId: string | null;
    checkInTime: Date;
    checkOutTime: Date | null;
    status: SessionStatus;
  }> = {},
) => ({
  id: 'session-uuid-1',
  vehicleType: VehicleType.car,
  vehicleId: null,
  reservationId: null,
  checkInTime: new Date('2024-01-01T08:00:00Z'),
  checkOutTime: null,
  status: SessionStatus.active,
  ...overrides,
});

function makeSegmentedResult(hourlyRate: number, durationHours: number) {
  const cost = Math.ceil(durationHours) * hourlyRate;
  return {
    vehicleType: VehicleType.car,
    checkIn: new Date(),
    checkOut: new Date(),
    totalDurationMs: durationHours * 3600000,
    totalDurationHours: durationHours,
    totalCost: cost,
    segments: [
      {
        from: new Date(),
        to: new Date(),
        rateTable: {
          id: 'def-1',
          type: 'DEFAULT' as const,
          hourlyRate,
          name: null,
          priority: 0,
        },
        durationMs: durationHours * 3600000,
        durationHours,
        cost,
      },
    ],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FeesService', () => {
  let service: FeesService;
  let prisma: {
    pricingConfig: { findFirst: jest.Mock };
    parkingSession: { findUnique: jest.Mock };
    subscription: { findFirst: jest.Mock };
  };
  let resolver: {
    calculateSegmentedCost: jest.Mock;
    getActiveRate: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      pricingConfig: { findFirst: jest.fn() },
      parkingSession: { findUnique: jest.fn() },
      subscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    resolver = {
      calculateSegmentedCost: jest.fn(),
      getActiveRate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricingResolver, useValue: resolver },
      ],
    }).compile();

    service = module.get<FeesService>(FeesService);
  });

  // ─── calculate() ─────────────────────────────────────────────────────────

  describe('calculate()', () => {
    it('should round up partial hours (14.2)', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 2.25),
      );

      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:15:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, false);

      expect(result.roundedHours).toBe(3);
      expect(result.baseFee).toBe(3 * 20000); // 60000
      expect(result.totalFee).toBe(60000);
    });

    it('should not round up exact hours', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 2),
      );

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
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 0.167),
      );

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
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 25),
      );

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
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 24),
      );

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
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 2),
      );

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
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 25),
      );

      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-02T09:00:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      const result = await service.calculate(session, true);

      expect(result.isOvertime).toBe(true);
      expect(result.isLostTicket).toBe(true);
      expect(result.totalFee).toBe(25 * 20000 + 50000 + 100000); // 650000
    });

    it('should use motorbike rate from resolver (14.5)', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(
        makePricing({ vehicleType: VehicleType.motorbike }),
      );
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(10000, 3),
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

    it('should use provided checkOutTime override', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 4),
      );

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

    // ─── BR-09/10: Locked rate for reservation sessions ───────────────

    it('should use locked rate when provided (BR-09)', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());
      // resolver should NOT be called for locked rate sessions

      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:00:00Z');
      const session = makeSession({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        reservationId: 'res-1',
      });

      const result = await service.calculate(
        session,
        false,
        undefined,
        undefined,
        30000, // locked rate
      );

      expect(result.hourlyRate).toBe(30000);
      expect(result.roundedHours).toBe(2);
      expect(result.originalBaseFee).toBe(60000); // 2 × 30000
      expect(resolver.calculateSegmentedCost).not.toHaveBeenCalled();
    });

    it('should apply reservation discount on locked rate', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(
        makePricing({ reservationDiscountPercent: 20 }),
      );

      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:00:00Z');
      const session = makeSession({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        reservationId: 'res-1',
      });

      const result = await service.calculate(
        session,
        false,
        undefined,
        undefined,
        30000, // locked rate
      );

      expect(result.hasReservation).toBe(true);
      expect(result.originalBaseFee).toBe(60000);
      expect(result.reservationDiscountAmount).toBe(12000); // 20% of 60000
      expect(result.baseFee).toBe(48000);
    });

    // ─── BR-05: Segmented cost (walk-in) ────────────────────────────

    it('should use resolver for walk-in sessions (no locked rate)', async () => {
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing());
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 2),
      );

      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:00:00Z');
      const session = makeSession({ checkInTime: checkIn, checkOutTime: checkOut });

      await service.calculate(session, false);

      expect(resolver.calculateSegmentedCost).toHaveBeenCalledWith(
        VehicleType.car,
        checkIn,
        checkOut,
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
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 2.5),
      );

      const result = await service.preview('session-uuid-1', false);

      expect(prisma.parkingSession.findUnique).toHaveBeenCalledWith({
        where: { id: 'session-uuid-1' },
        select: {
          id: true,
          vehicleType: true,
          vehicleId: true,
          reservationId: true,
          checkInTime: true,
          checkOutTime: true,
          status: true,
        },
      });
      expect(result.roundedHours).toBe(3); // 2.5h → ceil → 3
      expect(result.baseFee).toBe(60000);
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
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 2),
      );

      const result = await service.preview('session-uuid-1', true);

      expect(result.isLostTicket).toBe(true);
      expect(result.lostTicketPenalty).toBe(100000);
    });

    it('should apply 20% discount when session comes from a reservation', async () => {
      const checkIn = new Date('2024-01-01T08:00:00Z');
      const checkOut = new Date('2024-01-01T10:00:00Z'); // 2 hours = 40,000 VND
      const sessionData = makeSession({
        checkInTime: checkIn,
        checkOutTime: checkOut,
        reservationId: 'res-123',
      });
      prisma.pricingConfig.findFirst.mockResolvedValue(makePricing({ reservationDiscountPercent: 20 }));
      resolver.calculateSegmentedCost.mockResolvedValue(
        makeSegmentedResult(20000, 2),
      );

      const result = await service.calculate(sessionData as any);

      expect(result.hasReservation).toBe(true);
      expect(result.originalBaseFee).toBe(40000);
      expect(result.reservationDiscountAmount).toBe(8000); // 20% of 40,000
      expect(result.baseFee).toBe(32000); // 40,000 - 8,000
      expect(result.totalFee).toBe(32000);
    });
  });
});
