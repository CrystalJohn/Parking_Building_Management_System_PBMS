import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PricingResolver } from './pricing-resolver.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PricingResolver', () => {
  let service: PricingResolver;
  let prisma: {
    rateTable: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      rateTable: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingResolver,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PricingResolver>(PricingResolver);
  });

  describe('getActiveRate', () => {
    it('should return EVENT rate when active at given time', async () => {
      const eventRate = {
        id: 'evt-1',
        type: 'EVENT',
        vehicleType: 'car',
        hourlyRate: 30000,
        name: 'Holiday',
        priority: 1,
        effectiveFrom: new Date('2026-08-10T00:00:00Z'),
        effectiveTo: new Date('2026-08-11T00:00:00Z'),
      };

      prisma.rateTable.findFirst
        .mockResolvedValueOnce(eventRate) // EVENT query
        .mockResolvedValueOnce(null); // DEFAULT not reached

      const result = await service.getActiveRate(
        'car',
        new Date('2026-08-10T12:00:00Z'),
      );

      expect(result).toEqual(eventRate);
    });

    it('should fallback to DEFAULT when no EVENT is active', async () => {
      const defaultRate = {
        id: 'def-1',
        type: 'DEFAULT',
        vehicleType: 'car',
        hourlyRate: 20000,
        name: null,
        priority: 0,
      };

      prisma.rateTable.findFirst
        .mockResolvedValueOnce(null) // No EVENT
        .mockResolvedValueOnce(defaultRate); // DEFAULT

      const result = await service.getActiveRate(
        'car',
        new Date('2026-08-10T12:00:00Z'),
      );

      expect(result).toEqual(defaultRate);
    });

    it('should throw NotFoundException when no rate table exists', async () => {
      prisma.rateTable.findFirst
        .mockResolvedValueOnce(null) // No EVENT
        .mockResolvedValueOnce(null); // No DEFAULT

      await expect(
        service.getActiveRate('car', new Date()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prefer higher priority EVENT when multiple overlap', async () => {
      const highPriority = {
        id: 'evt-high',
        type: 'EVENT',
        vehicleType: 'car',
        hourlyRate: 50000,
        name: 'VIP Event',
        priority: 10,
      };

      prisma.rateTable.findFirst
        .mockResolvedValueOnce(highPriority) // ORDER BY priority DESC LIMIT 1
        .mockResolvedValueOnce(null);

      const result = await service.getActiveRate(
        'car',
        new Date('2026-08-10T12:00:00Z'),
      );

      expect(result.id).toBe('evt-high');
    });
  });

  describe('calculateSegmentedCost', () => {
    it('should calculate cost for single DEFAULT segment', async () => {
      // No overlapping events
      prisma.rateTable.findMany.mockResolvedValue([]);

      const defaultRate = {
        id: 'def-1',
        type: 'DEFAULT',
        vehicleType: 'car',
        hourlyRate: 20000,
        name: null,
        priority: 0,
      };

      prisma.rateTable.findFirst
        .mockResolvedValue(defaultRate); // getActiveRate fallback

      const checkIn = new Date('2026-08-10T10:00:00Z');
      const checkOut = new Date('2026-08-10T12:00:00Z'); // 2 hours

      const result = await service.calculateSegmentedCost(
        'car',
        checkIn,
        checkOut,
      );

      expect(result.totalCost).toBe(40000); // 2h × 20000
      expect(result.segments).toHaveLength(1);
    });

    it('should calculate segmented cost across DEFAULT → EVENT', async () => {
      const eventRate = {
        id: 'evt-1',
        type: 'EVENT',
        vehicleType: 'car',
        hourlyRate: 30000,
        name: 'Holiday',
        priority: 1,
        effectiveFrom: new Date('2026-08-10T12:00:00Z'),
        effectiveTo: new Date('2026-08-10T18:00:00Z'),
      };

      prisma.rateTable.findMany.mockResolvedValue([eventRate]);

      const defaultRate = {
        id: 'def-1',
        type: 'DEFAULT',
        vehicleType: 'car',
        hourlyRate: 20000,
        name: null,
        priority: 0,
      };

      prisma.rateTable.findFirst.mockImplementation(async (args) => {
        if (args.where.type === 'EVENT') {
          const at: Date = args.where.effectiveFrom.lte;
          if (at >= eventRate.effectiveFrom && at < eventRate.effectiveTo) {
            return eventRate;
          }
          return null;
        }
        return defaultRate;
      });

      // 10:00 - 14:00 = 4 hours
      // Segment 1: 10:00-12:00 (DEFAULT) = 2h × 20000 = 40000
      // Segment 2: 12:00-14:00 (EVENT) = 2h × 30000 = 60000
      // Total = 100000
      const checkIn = new Date('2026-08-10T10:00:00Z');
      const checkOut = new Date('2026-08-10T14:00:00Z');

      const result = await service.calculateSegmentedCost(
        'car',
        checkIn,
        checkOut,
      );

      expect(result.totalCost).toBe(100000);
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].rateTable.type).toBe('DEFAULT');
      expect(result.segments[1].rateTable.type).toBe('EVENT');
    });

    it('should calculate segmented cost across DEFAULT → EVENT → DEFAULT', async () => {
      const eventRate = {
        id: 'evt-1',
        type: 'EVENT',
        vehicleType: 'car',
        hourlyRate: 30000,
        name: 'Holiday',
        priority: 1,
        effectiveFrom: new Date('2026-08-10T12:00:00Z'),
        effectiveTo: new Date('2026-08-10T16:00:00Z'),
      };

      prisma.rateTable.findMany.mockResolvedValue([eventRate]);

      const defaultRate = {
        id: 'def-1',
        type: 'DEFAULT',
        vehicleType: 'car',
        hourlyRate: 20000,
        name: null,
        priority: 0,
      };

      prisma.rateTable.findFirst.mockImplementation(async (args) => {
        if (args.where.type === 'EVENT') {
          const at: Date = args.where.effectiveFrom.lte;
          if (at >= eventRate.effectiveFrom && at < eventRate.effectiveTo) {
            return eventRate;
          }
          return null;
        }
        return defaultRate;
      });

      // 10:00 - 18:00 = 8 hours
      // Segment 1: 10:00-12:00 (DEFAULT) = 2h × 20000 = 40000
      // Segment 2: 12:00-16:00 (EVENT) = 4h × 30000 = 120000
      // Segment 3: 16:00-18:00 (DEFAULT) = 2h × 20000 = 40000
      // Total = 200000
      const checkIn = new Date('2026-08-10T10:00:00Z');
      const checkOut = new Date('2026-08-10T18:00:00Z');

      const result = await service.calculateSegmentedCost(
        'car',
        checkIn,
        checkOut,
      );

      expect(result.totalCost).toBe(200000);
      expect(result.segments).toHaveLength(3);
    });

    it('should use higher priority EVENT when two overlap same time', async () => {
      const lowPriority = {
        id: 'evt-low',
        type: 'EVENT',
        vehicleType: 'car',
        hourlyRate: 25000,
        name: 'Low',
        priority: 1,
        effectiveFrom: new Date('2026-08-10T10:00:00Z'),
        effectiveTo: new Date('2026-08-10T16:00:00Z'),
      };

      const highPriority = {
        id: 'evt-high',
        type: 'EVENT',
        vehicleType: 'car',
        hourlyRate: 50000,
        name: 'High',
        priority: 5,
        effectiveFrom: new Date('2026-08-10T12:00:00Z'),
        effectiveTo: new Date('2026-08-10T14:00:00Z'),
      };

      // findMany returns both, sorted by priority DESC
      prisma.rateTable.findMany.mockResolvedValue([highPriority, lowPriority]);

      // getActiveRate at 10:00 → highPriority.effectiveFrom > 10:00 → fallback to lowPriority
      // Actually, the overlap check uses effectiveFrom < checkOut AND effectiveTo > checkIn
      // At t=10:00: highPriority.effectiveFrom (12:00) > 10:00, so it's not active yet
      // lowPriority is active from 10:00-16:00

      const defaultRate = {
        id: 'def-1',
        type: 'DEFAULT',
        vehicleType: 'car',
        hourlyRate: 20000,
        name: null,
        priority: 0,
      };

      prisma.rateTable.findFirst.mockImplementation(async (args) => {
        if (args.where.type === 'EVENT') {
          const at: Date = args.where.effectiveFrom.lte;
          const h = at.getUTCHours();
          // At t=12:00-14:00: both match, highPriority wins
          if (h >= 12 && h < 14) {
            return highPriority;
          }
          // At t=10:00-12:00: only lowPriority
          if (h >= 10 && h < 16) {
            return lowPriority;
          }
          return null;
        }
        return defaultRate;
      });

      // 10:00 - 14:00 = 4 hours
      // Segment 1: 10:00-12:00 (lowPriority) = 2h × 25000 = 50000
      // Segment 2: 12:00-14:00 (highPriority) = 2h × 50000 = 100000
      // Total = 150000
      const checkIn = new Date('2026-08-10T10:00:00Z');
      const checkOut = new Date('2026-08-10T14:00:00Z');

      const result = await service.calculateSegmentedCost(
        'car',
        checkIn,
        checkOut,
      );

      expect(result.totalCost).toBe(150000);
      expect(result.segments[0].rateTable.id).toBe('evt-low');
      expect(result.segments[1].rateTable.id).toBe('evt-high');
    });

    it('should handle exact-hour boundary segments correctly', async () => {
      // No events — single DEFAULT segment
      prisma.rateTable.findMany.mockResolvedValue([]);

      const defaultRate = {
        id: 'def-1',
        type: 'DEFAULT',
        vehicleType: 'motorbike',
        hourlyRate: 10000,
        name: null,
        priority: 0,
      };

      prisma.rateTable.findFirst.mockResolvedValue(defaultRate);

      const checkIn = new Date('2026-08-10T10:00:00Z');
      const checkOut = new Date('2026-08-10T10:30:00Z'); // 30 min → ceil = 1h

      const result = await service.calculateSegmentedCost(
        'motorbike',
        checkIn,
        checkOut,
      );

      // durationHours = 0.5, ceil = 1h, cost = 10000
      expect(result.totalCost).toBe(10000);
      expect(result.segments).toHaveLength(1);
    });
  });
});
