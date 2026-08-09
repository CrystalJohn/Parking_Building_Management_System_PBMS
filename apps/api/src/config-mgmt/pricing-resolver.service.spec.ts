import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RateTableType, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingResolver } from './pricing-resolver.service';

const defaultRate = (vehicleType: VehicleType, hourlyRate: number) => ({
  id: `rate-default-${vehicleType}`,
  name: null,
  type: RateTableType.DEFAULT,
  vehicleType,
  hourlyRate,
  effectiveFrom: null,
  effectiveTo: null,
  priority: 0,
  isActive: true,
  createdBy: 'seed',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

const eventRate = (hourlyRate: number, from: Date, to: Date, priority = 1) => ({
  id: 'rate-event-1',
  name: 'Peak',
  type: RateTableType.EVENT,
  vehicleType: VehicleType.car,
  hourlyRate,
  effectiveFrom: from,
  effectiveTo: to,
  priority,
  isActive: true,
  createdBy: 'seed',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

describe('PricingResolver.calculateSegmentedCost', () => {
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
      providers: [PricingResolver, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PricingResolver);
  });

  it('bills a single segment at the DEFAULT rate, rounded up to the hour (BR-01/BR-18)', async () => {
    prisma.rateTable.findMany.mockResolvedValue([]);
    prisma.rateTable.findFirst.mockResolvedValue(
      defaultRate(VehicleType.motorbike, 10000),
    );

    const result = await service.calculateSegmentedCost(
      VehicleType.motorbike,
      new Date('2026-08-08T10:00:00+07:00'),
      new Date('2026-08-08T11:30:00+07:00'),
    );

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].durationHours).toBe(1.5);
    expect(result.segments[0].rateTable.hourlyRate).toBe(10000);
    // ceil(1.5) = 2 billable hours — same rounding as the locked-rate path.
    expect(result.totalCost).toBe(20000);
    expect(result.totalDurationHours).toBe(1.5);
  });

  it('splits at EVENT boundaries and resolves the rate per segment (BR-05)', async () => {
    const from = new Date('2026-08-08T11:00:00+07:00');
    const to = new Date('2026-08-08T12:00:00+07:00');
    const event = eventRate(30000, from, to);

    prisma.rateTable.findMany.mockResolvedValue([event]);
    prisma.rateTable.findFirst.mockImplementation(({ where }) => {
      const at = where.effectiveFrom.lte;
      return Promise.resolve(
        at >= from && at < to ? event : defaultRate(VehicleType.car, 20000),
      );
    });

    const result = await service.calculateSegmentedCost(
      VehicleType.car,
      new Date('2026-08-08T10:30:00+07:00'),
      new Date('2026-08-08T12:30:00+07:00'),
    );

    expect(result.segments.map((s) => s.durationHours)).toEqual([0.5, 1, 0.5]);
    expect(result.segments.map((s) => s.rateTable.hourlyRate)).toEqual([
      20000, 30000, 20000,
    ]);
    expect(result.totalDurationHours).toBe(2);
  });

  // NOTE: each segment is rounded up independently, so a stay that crosses an
  // EVENT boundary is billed for more hours than it lasted: the 2-hour stay
  // above yields 3 billable hours (20000 + 30000 + 20000). This test records
  // what the code does today; whether it is the intended price is a business
  // decision, not a settled one.
  it('rounds up each segment independently, inflating billable hours across boundaries', async () => {
    const from = new Date('2026-08-08T11:00:00+07:00');
    const to = new Date('2026-08-08T12:00:00+07:00');
    const event = eventRate(30000, from, to);

    prisma.rateTable.findMany.mockResolvedValue([event]);
    prisma.rateTable.findFirst.mockImplementation(({ where }) => {
      const at = where.effectiveFrom.lte;
      return Promise.resolve(
        at >= from && at < to ? event : defaultRate(VehicleType.car, 20000),
      );
    });

    const result = await service.calculateSegmentedCost(
      VehicleType.car,
      new Date('2026-08-08T10:30:00+07:00'),
      new Date('2026-08-08T12:30:00+07:00'),
    );

    expect(result.segments.map((s) => s.cost)).toEqual([20000, 30000, 20000]);
    expect(result.totalCost).toBe(70000);
  });

  it('prefers the highest-priority EVENT over the DEFAULT rate (BR-03/BR-04)', async () => {
    const from = new Date('2026-08-08T10:00:00+07:00');
    const to = new Date('2026-08-08T11:00:00+07:00');
    const event = eventRate(50000, from, to, 5);

    prisma.rateTable.findMany.mockResolvedValue([event]);
    prisma.rateTable.findFirst.mockResolvedValue(event);

    const result = await service.calculateSegmentedCost(
      VehicleType.car,
      from,
      to,
    );

    expect(prisma.rateTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: RateTableType.EVENT }),
        orderBy: { priority: 'desc' },
      }),
    );
    expect(result.totalCost).toBe(50000);
  });

  it('throws when the vehicle type has no active rate table at all', async () => {
    prisma.rateTable.findMany.mockResolvedValue([]);
    prisma.rateTable.findFirst.mockResolvedValue(null);

    await expect(
      service.calculateSegmentedCost(
        VehicleType.car,
        new Date('2026-08-08T10:00:00+07:00'),
        new Date('2026-08-08T11:00:00+07:00'),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
