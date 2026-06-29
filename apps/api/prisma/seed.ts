import { PrismaClient, Role, Zone, VehicleType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function calculateWalkingDistance(
  floorNumber: number,
  zone: Zone,
  slotNumber: number,
): number {
  const floorBaseDistance = floorNumber === 1 ? 20 : floorNumber === 2 ? 45 : 70;
  const zoneOffset = zone === Zone.A ? 0 : 8;
  const slotOffset = (slotNumber - 1) * 2;

  return floorBaseDistance + zoneOffset + slotOffset;
}

async function main() {
  console.log('🌱 Seeding database...');

  // ─── 1. Users: 1 admin, 1 manager, 1 staff ──────────────────────────────
  const saltRounds = 10;
  const defaultPassword = await bcrypt.hash('123456', saltRounds);

  const admin = await prisma.user.upsert({
    where: { phone: '0900000001' },
    update: { username: 'admin', passwordHash: defaultPassword },
    create: {
      phone: '0900000001',
      username: 'admin',
      passwordHash: defaultPassword,
      role: Role.admin,
      fullName: 'System Admin',
    },
  });

  const manager = await prisma.user.upsert({
    where: { phone: '0900000002' },
    update: { username: 'manager', passwordHash: defaultPassword },
    create: {
      phone: '0900000002',
      username: 'manager',
      passwordHash: defaultPassword,
      role: Role.manager,
      fullName: 'Facility Manager',
    },
  });

  const staff = await prisma.user.upsert({
    where: { phone: '0900000003' },
    update: { username: 'staff', passwordHash: defaultPassword },
    create: {
      phone: '0900000003',
      username: 'staff',
      passwordHash: defaultPassword,
      role: Role.staff,
      fullName: 'Gate Staff',
    },
  });

  console.log(`✅ Users seeded: admin(${admin.id}), manager(${manager.id}), staff(${staff.id})`);

  // ─── 2. Floors: T1, T2, T3 ──────────────────────────────────────────────
  const floors = await Promise.all(
    [1, 2, 3].map((num) =>
      prisma.floor.upsert({
        where: { floorNumber: num },
        update: {},
        create: {
          floorNumber: num,
          name: `T${num}`,
        },
      }),
    ),
  );

  console.log(`✅ Floors seeded: ${floors.map((f) => f.name).join(', ')}`);

  // ─── 3. Slots: 90 total (10 Zone A + 20 Zone B per floor) ───────────────
  let slotCount = 0;

  for (const floor of floors) {
    // Zone A: 10 car slots per floor
    for (let i = 1; i <= 10; i++) {
      const code = `T${floor.floorNumber}-A-${String(i).padStart(2, '0')}`;
      const walkingDistance = calculateWalkingDistance(
        floor.floorNumber,
        Zone.A,
        i,
      );
      await prisma.slot.upsert({
        where: { code },
        update: { walkingDistance },
        create: {
          floorId: floor.id,
          zone: Zone.A,
          slotNumber: i,
          code,
          vehicleType: VehicleType.car,
          walkingDistance,
        },
      });
      slotCount++;
    }

    // Zone B: 20 motorbike slots per floor
    for (let i = 1; i <= 20; i++) {
      const code = `T${floor.floorNumber}-B-${String(i).padStart(2, '0')}`;
      const walkingDistance = calculateWalkingDistance(
        floor.floorNumber,
        Zone.B,
        i,
      );
      await prisma.slot.upsert({
        where: { code },
        update: { walkingDistance },
        create: {
          floorId: floor.id,
          zone: Zone.B,
          slotNumber: i,
          code,
          vehicleType: VehicleType.motorbike,
          walkingDistance,
        },
      });
      slotCount++;
    }
  }

  console.log(`✅ Slots seeded: ${slotCount} total`);

  // ─── 4. PricingConfig ────────────────────────────────────────────────────
  // Car: 20000 VND/h, overtime 50k, lost ticket 100k, threshold 24h
  await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: {
      vehicleType: VehicleType.car,
      hourlyRate: 20000,
      overtimePenalty: 50000,
      lostTicketPenalty: 100000,
      overtimeThresholdHours: 24,
    },
    create: {
      vehicleType: VehicleType.car,
      hourlyRate: 20000,
      overtimePenalty: 50000,
      lostTicketPenalty: 100000,
      overtimeThresholdHours: 24,
    },
  });

  // Motorbike: 10000 VND/h, overtime 50k, lost ticket 100k, threshold 24h
  await prisma.pricingConfig.upsert({
    where: { id: 2 },
    update: {
      vehicleType: VehicleType.motorbike,
      hourlyRate: 10000,
      overtimePenalty: 50000,
      lostTicketPenalty: 100000,
      overtimeThresholdHours: 24,
    },
    create: {
      vehicleType: VehicleType.motorbike,
      hourlyRate: 10000,
      overtimePenalty: 50000,
      lostTicketPenalty: 100000,
      overtimeThresholdHours: 24,
    },
  });

  console.log('✅ PricingConfig seeded: car 20000 VND/h, motorbike 10000 VND/h');

  // ─── 5. SystemConfig ────────────────────────────────────────────────────
  const systemConfigs = [
    {
      configKey: 'active_allocation_strategy',
      configValue: 'fair_distance_based',
      description: 'Current slot allocation algorithm',
    },
    {
      configKey: 'reservation_timeout_minutes',
      configValue: '60',
      description: 'Short-term reservation hold duration in minutes',
    },
    {
      configKey: 'peak_hours',
      configValue: '08-09,17-18',
      description: 'Peak hour windows (HH-HH comma-separated) for analysis',
    },
    {
      configKey: 'overtime_threshold_hours',
      configValue: '24',
      description: 'Hours after which overtime penalty applies',
    },
    {
      configKey: 'max_active_sessions_per_user',
      configValue: '3',
      description: 'Soft limit to prevent abuse',
    },
    {
      configKey: 'simulation_plate_prefix',
      configValue: 'SIM-',
      description: 'Prefix used by simulation to avoid clashing with real plates',
    },
  ];

  for (const config of systemConfigs) {
    await prisma.systemConfig.upsert({
      where: { configKey: config.configKey },
      update: {
        configValue: config.configValue,
        description: config.description,
        updatedBy: 'system',
      },
      create: {
        configKey: config.configKey,
        configValue: config.configValue,
        description: config.description,
        updatedBy: 'system',
      },
    });
  }

  console.log(`✅ SystemConfig seeded: ${systemConfigs.length} entries`);

  console.log('\n🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
