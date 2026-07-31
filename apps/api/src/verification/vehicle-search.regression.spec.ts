import 'dotenv/config';
import { VehiclesService } from '../vehicles/vehicles.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Regression verification: vehicle search must resolve the same vehicle
 * regardless of input format (canonical / display / lowercase-raw).
 *
 * AC C: 30A12345, 30A-123.45, 30a12345 must all find the same vehicle.
 */

const SEED_PLATE = '30A12345';

const makeVehicleRow = () => ({
  id: 'vehicle-verify-1',
  plateNumber: SEED_PLATE,
  plateDisplay: '30A-123.45',
  vehicleType: 'car',
  isActive: true,
  registeredAt: new Date('2026-07-01T00:00:00Z'),
  vehicleUsers: [],
  subscriptions: [],
});

describe('vehicle search regression (AC C) — normalization delegation (unit)', () => {
  let findFirst: jest.Mock;
  let findMany: jest.Mock;
  let reservationFindFirst: jest.Mock;
  let service: VehiclesService;

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue(makeVehicleRow());
    findMany = jest.fn().mockResolvedValue([]);
    reservationFindFirst = jest.fn().mockResolvedValue(null);
    service = new VehiclesService({
      vehicle: { findFirst, findMany: jest.fn() },
      parkingSession: { findMany },
      reservation: { findFirst: reservationFindFirst },
    } as any);
  });

  it('C: "30A12345", "30A-123.45", "30a12345" all query canonical 30A12345 and match the same vehicle', async () => {
    for (const input of ['30A12345', '30A-123.45', '30a12345']) {
      const result = await service.matchPlate(input);
      expect(result.matched).toBe(true);
      expect(result.vehicle?.id).toBe('vehicle-verify-1');
      expect(result.normalizedPlate).toBe('30A12345');
      expect(findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { plateNumber: '30A12345', isActive: true },
        }),
      );
    }
    expect(findFirst).toHaveBeenCalledTimes(3);
  });

  it('C: empty/whitespace input is rejected before any DB query', async () => {
    await expect(service.matchPlate('  ')).rejects.toThrow('plateNumber is required');
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('vehicle search regression (AC C) — real database', () => {
  let prisma: PrismaService;
  let service: VehiclesService;
  let seededId: string | null = null;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/localhost|127\.0\.0\.1/.test(url)) {
      throw new Error(
        `Integration tests require a LOCAL database. DATABASE_URL=${url} — refusing to run against a remote (production) database.`,
      );
    }
    prisma = new PrismaService();
    await prisma.$connect();
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      throw new Error(
        `Cannot connect to local database for integration tests: ${(err as Error).message}`,
      );
    }

    const existing = await prisma.vehicle.findUnique({
      where: { plateNumber: SEED_PLATE },
    });
    if (!existing) {
      const seeded = await prisma.vehicle.create({
        data: { plateNumber: SEED_PLATE, plateDisplay: '30A-123.45', vehicleType: 'car', isActive: true },
      });
      seededId = seeded.id;
    }

    service = new VehiclesService(prisma);
  });

  afterAll(async () => {
    if (seededId) {
      await prisma.vehicle.delete({ where: { id: seededId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('C: all three input formats resolve to the same vehicle row', async () => {
    const matchedIds = new Set<string>();
    for (const input of ['30A12345', '30A-123.45', '30a12345']) {
      const result = await service.lookupPlate(input);
      expect(result.matched).toBe(true);
      expect(result.normalizedPlate).toBe('30A12345');
      expect(result.vehicle?.plateDisplay).toBe('30A-123.45');
      matchedIds.add(result.vehicle!.id);
    }
    expect(matchedIds.size).toBe(1);
  });

  it('C: a non-matching plate resolves to matched=false', async () => {
    const result = await service.lookupPlate('51K-999.99');
    expect(result.matched).toBe(false);
    expect(result.normalizedPlate).toBe('51K99999');
    expect(result.vehicle).toBeNull();
  });
});
