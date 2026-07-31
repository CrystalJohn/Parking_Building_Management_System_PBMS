import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { runBackfill } from '../../scripts/backfill-plate-display';
import { PlateFormatter } from '../plates';

/**
 * Database migration verification (AC D):
 *  - both plate-normalization migrations applied
 *  - all five new columns exist
 *  - the backfill script fills plateDisplay for every standard vehicle record
 *  - backfill is idempotent
 *
 * Requires a LOCAL PostgreSQL database (DATABASE_URL must point to localhost).
 */

const requireLocalDb = () => {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      `Migration verification requires a LOCAL database. DATABASE_URL=${url} â€” refusing to run against a remote (production) database.`,
    );
  }
};

describe('database migration verification (AC D)', () => {
  let prisma: PrismaClient;
  const seededIds: string[] = [];

  beforeAll(async () => {
    requireLocalDb();
    prisma = new PrismaClient();
    await prisma.$connect();
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      throw new Error(
        `Cannot connect to local database for migration verification: ${(err as Error).message}`,
      );
    }
  });

  afterAll(async () => {
    if (seededIds.length > 0) {
      await prisma.vehicle.deleteMany({ where: { id: { in: seededIds } } });
    }
    await prisma.$disconnect();
  });

  it('applies both plate-normalization migrations', async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations
    `;
    const names = rows.map((r) => r.migration_name);
    expect(names).toContain('20260731000000_baseline_drift_reconciliation');
    expect(names).toContain('20260731094020_add_plate_normalization_fields');
  });

  it('creates all five normalization columns', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('plate_display', 'raw_plate', 'canonical_plate', 'display_plate')
    `;
    const pairs = rows.map((r) => `${r.table_name}.${r.column_name}`);
    expect(pairs).toEqual(
      expect.arrayContaining([
        'vehicles.plate_display',
        'parking_sessions.plate_display',
        'ocr_evidences.raw_plate',
        'ocr_evidences.canonical_plate',
        'ocr_evidences.display_plate',
      ]),
    );
  });

  it('D: backfill fills plateDisplay for every standard vehicle record', async () => {
    const seeds = [
      { plateNumber: '30A12345', vehicleType: 'car' as const, expected: '30A-123.45' },
      { plateNumber: '51K99999', vehicleType: 'car' as const, expected: '51K-999.99' },
      { plateNumber: '59X345678', vehicleType: 'motorbike' as const, expected: '59X3-456.78' },
      { plateNumber: '29K644743', vehicleType: 'motorbike' as const, expected: '29K6-447.43' },
    ];

    for (const seed of seeds) {
      const v = await prisma.vehicle.create({
        data: { plateNumber: seed.plateNumber, vehicleType: seed.vehicleType, plateDisplay: null },
      });
      seededIds.push(v.id);
    }

    await runBackfill(prisma);

    for (const seed of seeds) {
      const v = await prisma.vehicle.findUnique({ where: { plateNumber: seed.plateNumber } });
      expect(v).not.toBeNull();
      expect(v?.plateDisplay).toBe(seed.expected);
      expect(v?.plateDisplay).toBe(PlateFormatter.toDisplay(seed.plateNumber));
    }

    const nullCount = await prisma.vehicle.count({ where: { plateDisplay: null } });
    expect(nullCount).toBe(0);
  });

  it('backfill is idempotent', async () => {
    await runBackfill(prisma);
    await runBackfill(prisma);

    const v = await prisma.vehicle.findUnique({ where: { plateNumber: '30A12345' } });
    expect(v?.plateDisplay).toBe('30A-123.45');
  });
});
