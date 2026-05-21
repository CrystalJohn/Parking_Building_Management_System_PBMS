import { PrismaClient, Role, Zone, VehicleType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── 1. Users: 1 admin, 1 manager, 1 staff ──────────────────────────────
  const saltRounds = 10;
  const defaultPassword = await bcrypt.hash('password123', saltRounds);

  const admin = await prisma.user.upsert({
    where: { phone: '0900000001' },
    update: {},
    create: {
      phone: '0900000001',
      passwordHash: defaultPassword,
      role: Role.admin,
      fullName: 'System Admin',
    },
  });

  const manager = await prisma.user.upsert({
    where: { phone: '0900000002' },
    update: {},
    create: {
      phone: '0900000002',
      passwordHash: defaultPassword,
      role: Role.manager,
      fullName: 'Facility Manager',
    },
  });

  const staff = await prisma.user.upsert({
    where: { phone: '0900000003' },
    update: {},
    create: {
      phone: '0900000003',
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
      await prisma.slot.upsert({
        where: { code },
        update: {},
        create: {
          floorId: floor.id,
          zone: Zone.A,
          slotNumber: i,
          code,
          vehicleType: VehicleType.car,
        },
      });
      slotCount++;
    }

    // Zone B: 20 motorbike slots per floor
    for (let i = 1; i <= 20; i++) {
      const code = `T${floor.floorNumber}-B-${String(i).padStart(2, '0')}`;
      await prisma.slot.upsert({
        where: { code },
        update: {},
        create: {
          floorId: floor.id,
          zone: Zone.B,
          slotNumber: i,
          code,
          vehicleType: VehicleType.motorbike,
        },
      });
      slotCount++;
    }
  }

  console.log(`✅ Slots seeded: ${slotCount} total`);

  // ─── 4. PricingConfig ────────────────────────────────────────────────────
  // Car: 8000 VND/h, overtime 50k, lost ticket 100k, threshold 24h
  await prisma.pricingConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      vehicleType: VehicleType.car,
      hourlyRate: 8000,
      overtimePenalty: 50000,
      lostTicketPenalty: 100000,
      overtimeThresholdHours: 24,
    },
  });

  // Motorbike: 5000 VND/h, overtime 50k, lost ticket 100k, threshold 24h
  await prisma.pricingConfig.upsert({
    where: { id: 2 },
    update: {},
    create: {
      vehicleType: VehicleType.motorbike,
      hourlyRate: 5000,
      overtimePenalty: 50000,
      lostTicketPenalty: 100000,
      overtimeThresholdHours: 24,
    },
  });

  console.log('✅ PricingConfig seeded: car 8000 VND/h, motorbike 5000 VND/h');

  // ─── 5. SystemConfig ────────────────────────────────────────────────────
  const systemConfigs = [
    {
      configKey: 'active_allocation_strategy',
      configValue: 'balanced_occupancy',
      description: 'Current slot allocation algorithm',
    },
    {
      configKey: 'reservation_timeout_minutes',
      configValue: '30',
      description: 'Auto-cancel reservation after this many minutes',
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
      update: {},
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
