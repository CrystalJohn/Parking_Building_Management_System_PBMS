import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AllocationService } from '../slots/allocation.service';
import { PrismaService } from '../prisma/prisma.service';

const runtimeClientPath = path.resolve(__dirname, '../../temp-prisma-client');
// Keep the same real-DB integration setup as vehicles.integration.spec.ts.
const prismaModule = (
  fs.existsSync(path.join(runtimeClientPath, 'index.js'))
    ? require(runtimeClientPath)
    : require('@prisma/client')
) as typeof import('@prisma/client');

const { PrismaClient, SlotStatus, VehicleType } = prismaModule;

const runDbIntegration =
  process.env.PBMS_RUN_DB_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);

const describeDb = runDbIntegration ? describe : describe.skip;

describeDb('Allocation concurrency (real DB)', () => {
  const prisma = new PrismaClient();
  let allocationService: AllocationService;
  let originalMotorbikeSlots: Array<{ id: number; status: typeof SlotStatus[keyof typeof SlotStatus] }> = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AllocationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    allocationService = moduleRef.get<AllocationService>(AllocationService);
    originalMotorbikeSlots = await prisma.slot.findMany({
      where: { vehicleType: VehicleType.motorbike },
      select: { id: true, status: true },
    });
  });

  afterAll(async () => {
    for (const slot of originalMotorbikeSlots) {
      await prisma.slot.update({
        where: { id: slot.id },
        data: { status: slot.status },
      });
    }
    await prisma.$disconnect();
  });

  async function resetAndSeedOneSlot(vehicleType: typeof VehicleType[keyof typeof VehicleType]) {
    const sessionsToDelete = await prisma.parkingSession.findMany({
      where: {
        slot: { vehicleType },
        status: {
          in: ['active', 'checkout_pending', 'exit_authorized'],
        },
      },
      select: { id: true },
    });
    const sessionIds = sessionsToDelete.map((session) => session.id);

    if (sessionIds.length > 0) {
      await prisma.ocrEvidence.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.operationIssue.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.payment.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await prisma.parkingSession.deleteMany({ where: { id: { in: sessionIds } } });
    }

    await prisma.slot.updateMany({
      where: { vehicleType },
      data: { status: SlotStatus.occupied },
    });

    const oneSlot = await prisma.slot.findFirst({
      where: { vehicleType },
      orderBy: [{ floorId: 'asc' }, { zone: 'asc' }, { slotNumber: 'asc' }],
    });
    if (!oneSlot) {
      throw new Error('No slot found for allocation concurrency test. Check test seed data.');
    }

    await prisma.slot.update({
      where: { id: oneSlot.id },
      data: { status: SlotStatus.available },
    });

    return oneSlot.id;
  }

  async function allocateAndClaim(vehicleType: typeof VehicleType[keyof typeof VehicleType]) {
    return prisma.$transaction(async (tx) => {
      const { slot } = await allocationService.allocate(
        vehicleType,
        undefined,
        tx,
      );

      const lockedSlot = await tx.$queryRaw<{ id: number; status: string }[]>`
        SELECT id, status FROM slots
        WHERE id = ${slot.id} AND status = ${SlotStatus.available}::"SlotStatus"
        FOR UPDATE SKIP LOCKED
      `;

      if (!lockedSlot || lockedSlot.length === 0) {
        throw new ConflictException(
          `Slot ${slot.code} is no longer available. Please retry.`,
        );
      }

      await tx.slot.update({
        where: { id: slot.id },
        data: { status: SlotStatus.occupied },
      });

      return slot.id;
    });
  }

  it('does not double-assign one available slot under concurrent requests', async () => {
    for (let i = 0; i < 15; i++) {
      await resetAndSeedOneSlot(VehicleType.motorbike);

      const results = await Promise.allSettled([
        allocateAndClaim(VehicleType.motorbike),
        allocateAndClaim(VehicleType.motorbike),
      ]);

      const succeeded = results.filter((result) => result.status === 'fulfilled');
      const failed = results.filter((result) => result.status === 'rejected');

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect((failed[0] as PromiseRejectedResult).reason.message).toMatch(
        /No available slot|no longer available|retry/i,
      );

      const openSlots = await prisma.slot.count({
        where: {
          vehicleType: VehicleType.motorbike,
          status: SlotStatus.available,
        },
      });
      expect(openSlots).toBe(0);
    }
  });
});
