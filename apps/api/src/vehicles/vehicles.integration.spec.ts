import * as fs from 'node:fs';
import * as path from 'node:path';

const runtimeClientPath = path.resolve(__dirname, '../../temp-prisma-client');
// Prefer a dedicated full-engine client when present so DB integration tests can
// still run even if the default workspace client was generated with --no-engine.
// Fallback to the normal generated client in standard environments.
const prismaModule = (
  fs.existsSync(path.join(runtimeClientPath, 'index.js'))
    ? require(runtimeClientPath)
    : require('@prisma/client')
) as typeof import('@prisma/client');

const { PrismaClient, Role, VehicleType, VehicleUserRole } = prismaModule;

const runDbIntegration =
  process.env.PBMS_RUN_DB_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

const describeDb = runDbIntegration ? describe : describe.skip;

describeDb('VehicleUser owner constraint (real DB)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects 2nd owner insert with real DB constraint', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const vehicle = await prisma.vehicle.create({
      data: {
        plateNumber: `99X${suffix.replace(/[^0-9A-Z]/gi, '').slice(-6)}`,
        vehicleType: VehicleType.car,
      },
    });

    const userA = await prisma.user.create({
      data: {
        phone: `090${suffix.replace(/\D/g, '').slice(-7).padStart(7, '0')}`,
        email: `owner-a-${suffix}@pbms.local`,
        username: `owner-a-${suffix}`,
        passwordHash: 'hash',
        role: Role.driver,
        fullName: 'Owner A',
      },
    });

    const userB = await prisma.user.create({
      data: {
        phone: `091${suffix.replace(/\D/g, '').slice(-7).padStart(7, '0')}`,
        email: `owner-b-${suffix}@pbms.local`,
        username: `owner-b-${suffix}`,
        passwordHash: 'hash',
        role: Role.driver,
        fullName: 'Owner B',
      },
    });

    try {
      await prisma.vehicleUser.create({
        data: {
          vehicleId: vehicle.id,
          userId: userA.id,
          role: VehicleUserRole.owner,
        },
      });

      await expect(
        prisma.vehicleUser.create({
          data: {
            vehicleId: vehicle.id,
            userId: userB.id,
            role: VehicleUserRole.owner,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.vehicleUser.deleteMany({
        where: { vehicleId: vehicle.id },
      });
      await prisma.vehicle.delete({ where: { id: vehicle.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [userA.id, userB.id] } },
      });
    }
  });
});
