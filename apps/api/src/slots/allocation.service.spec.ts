import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SlotStatus, Zone, VehicleType } from '@prisma/client';
import {
  AllocationService,
  BalancedOccupancyStrategy,
} from './allocation.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeFloor = (
  overrides: Partial<{ id: number; floorNumber: number; name: string }> = {},
) => ({
  id: 1,
  floorNumber: 1,
  name: 'T1',
  ...overrides,
});

const makeSlot = (
  overrides: Partial<{
    id: number;
    floorId: number;
    zone: Zone;
    slotNumber: number;
    code: string;
    status: SlotStatus;
    vehicleType: VehicleType;
    floor: ReturnType<typeof makeFloor>;
  }> = {},
) => ({
  id: 1,
  floorId: 1,
  zone: Zone.A,
  slotNumber: 1,
  code: 'T1-A-01',
  status: SlotStatus.available,
  vehicleType: VehicleType.car,
  floor: makeFloor(),
  ...overrides,
});

// ─── BalancedOccupancyStrategy Unit Tests ────────────────────────────────────

describe('BalancedOccupancyStrategy', () => {
  let strategy: BalancedOccupancyStrategy;

  beforeEach(() => {
    strategy = new BalancedOccupancyStrategy();
  });

  it('has the correct name', () => {
    expect(strategy.name).toBe('balanced_occupancy');
  });

  // 12.4: Zone filtering
  it('assigns Zone A slots to cars', () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1 });
    const allSlots = [
      makeSlot({ id: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1 }),
      makeSlot({ id: 2, zone: Zone.B, vehicleType: VehicleType.motorbike, status: SlotStatus.available, floor: floor1 }),
    ];
    const available = allSlots.filter((s) => s.status === SlotStatus.available);

    const result = strategy.allocate(VehicleType.car, available, allSlots);

    expect(result.zone).toBe(Zone.A);
    expect(result.vehicleType).toBe(VehicleType.car);
  });

  it('assigns Zone B slots to motorbikes', () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1 });
    const allSlots = [
      makeSlot({ id: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1 }),
      makeSlot({ id: 2, zone: Zone.B, vehicleType: VehicleType.motorbike, status: SlotStatus.available, floor: floor1 }),
    ];
    const available = allSlots.filter((s) => s.status === SlotStatus.available);

    const result = strategy.allocate(VehicleType.motorbike, available, allSlots);

    expect(result.zone).toBe(Zone.B);
    expect(result.vehicleType).toBe(VehicleType.motorbike);
  });

  // 12.5: Throw when no slot available
  it('throws ConflictException when no slots available for vehicle type', () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1 });
    const allSlots = [
      makeSlot({ id: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.occupied, floor: floor1 }),
    ];
    const available: typeof allSlots = [];

    expect(() =>
      strategy.allocate(VehicleType.car, available, allSlots),
    ).toThrow(ConflictException);
  });

  // 12.2 + 12.3: Occupancy-based selection — picks floor with lowest occupancy
  it('picks the floor with lowest occupancy rate', () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1, name: 'T1' });
    const floor2 = makeFloor({ id: 2, floorNumber: 2, name: 'T2' });

    // Floor 1: 2 occupied, 1 available (occupancy = 2/3 ≈ 0.67)
    // Floor 2: 0 occupied, 3 available (occupancy = 0/3 = 0)
    const allSlots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.occupied, floor: floor1, slotNumber: 1, code: 'T1-A-01' }),
      makeSlot({ id: 2, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.occupied, floor: floor1, slotNumber: 2, code: 'T1-A-02' }),
      makeSlot({ id: 3, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1, slotNumber: 3, code: 'T1-A-03' }),
      makeSlot({ id: 4, floorId: 2, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor2, slotNumber: 1, code: 'T2-A-01' }),
      makeSlot({ id: 5, floorId: 2, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor2, slotNumber: 2, code: 'T2-A-02' }),
      makeSlot({ id: 6, floorId: 2, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor2, slotNumber: 3, code: 'T2-A-03' }),
    ];
    const available = allSlots.filter((s) => s.status === SlotStatus.available);

    const result = strategy.allocate(VehicleType.car, available, allSlots);

    // Should pick floor 2 (0% occupancy) over floor 1 (67% occupancy)
    expect(result.floorId).toBe(2);
    expect(result.floor.floorNumber).toBe(2);
  });

  // 12.3: Tiebreaker — equal occupancy → lowest floor
  it('picks lowest floor when occupancy is equal', () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1, name: 'T1' });
    const floor2 = makeFloor({ id: 2, floorNumber: 2, name: 'T2' });

    // Both floors: 0 occupied (occupancy = 0)
    const allSlots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1, slotNumber: 5, code: 'T1-A-05' }),
      makeSlot({ id: 2, floorId: 2, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor2, slotNumber: 1, code: 'T2-A-01' }),
    ];
    const available = [...allSlots];

    const result = strategy.allocate(VehicleType.car, available, allSlots);

    // Equal occupancy → pick floor 1 (lowest floor number)
    expect(result.floorId).toBe(1);
  });

  // 12.3: Tiebreaker — equal occupancy, same floor → lowest slot number
  it('picks lowest slot number within the same floor', () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1, name: 'T1' });

    const allSlots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1, slotNumber: 5, code: 'T1-A-05' }),
      makeSlot({ id: 2, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1, slotNumber: 2, code: 'T1-A-02' }),
      makeSlot({ id: 3, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1, slotNumber: 8, code: 'T1-A-08' }),
    ];
    const available = [...allSlots];

    const result = strategy.allocate(VehicleType.car, available, allSlots);

    expect(result.slotNumber).toBe(2);
  });

  // 12.2: Reserved slots count as occupied for occupancy calculation
  it('counts reserved slots as occupied in occupancy calculation', () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1, name: 'T1' });
    const floor2 = makeFloor({ id: 2, floorNumber: 2, name: 'T2' });

    // Floor 1: 1 reserved (counts as occupied), 1 available → occupancy = 1/2 = 0.5
    // Floor 2: 0 occupied, 2 available → occupancy = 0/2 = 0
    const allSlots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.B, vehicleType: VehicleType.motorbike, status: SlotStatus.reserved, floor: floor1, slotNumber: 1, code: 'T1-B-01' }),
      makeSlot({ id: 2, floorId: 1, zone: Zone.B, vehicleType: VehicleType.motorbike, status: SlotStatus.available, floor: floor1, slotNumber: 2, code: 'T1-B-02' }),
      makeSlot({ id: 3, floorId: 2, zone: Zone.B, vehicleType: VehicleType.motorbike, status: SlotStatus.available, floor: floor2, slotNumber: 1, code: 'T2-B-01' }),
      makeSlot({ id: 4, floorId: 2, zone: Zone.B, vehicleType: VehicleType.motorbike, status: SlotStatus.available, floor: floor2, slotNumber: 2, code: 'T2-B-02' }),
    ];
    const available = allSlots.filter((s) => s.status === SlotStatus.available);

    const result = strategy.allocate(VehicleType.motorbike, available, allSlots);

    // Floor 2 has lower occupancy
    expect(result.floorId).toBe(2);
    expect(result.slotNumber).toBe(1);
  });

  // Edge case: maintenance slots don't count as occupied
  it('does not count maintenance slots as occupied', () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1, name: 'T1' });
    const floor2 = makeFloor({ id: 2, floorNumber: 2, name: 'T2' });

    // Floor 1: 1 maintenance, 1 available → occupancy = 0/2 = 0
    // Floor 2: 1 occupied, 1 available → occupancy = 1/2 = 0.5
    const allSlots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.maintenance, floor: floor1, slotNumber: 1, code: 'T1-A-01' }),
      makeSlot({ id: 2, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1, slotNumber: 2, code: 'T1-A-02' }),
      makeSlot({ id: 3, floorId: 2, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.occupied, floor: floor2, slotNumber: 1, code: 'T2-A-01' }),
      makeSlot({ id: 4, floorId: 2, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor2, slotNumber: 2, code: 'T2-A-02' }),
    ];
    const available = allSlots.filter((s) => s.status === SlotStatus.available);

    const result = strategy.allocate(VehicleType.car, available, allSlots);

    // Floor 1 has 0% occupancy (maintenance doesn't count), floor 2 has 50%
    expect(result.floorId).toBe(1);
  });
});

// ─── AllocationService Integration Tests ─────────────────────────────────────

describe('AllocationService', () => {
  let service: AllocationService;
  let prisma: {
    slot: { findMany: jest.Mock };
    systemConfig: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      slot: { findMany: jest.fn() },
      systemConfig: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllocationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AllocationService>(AllocationService);
  });

  it('returns an AllocationResult with slot, strategy name, and timing', async () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1 });
    const slots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1 }),
    ];
    prisma.slot.findMany.mockResolvedValue(slots);

    const result = await service.allocate(VehicleType.car);

    expect(result.slot).toBeDefined();
    expect(result.slot.id).toBe(1);
    expect(result.allocationStrategy).toBe('balanced_occupancy');
    expect(typeof result.allocationTimeMs).toBe('number');
    expect(result.allocationTimeMs).toBeGreaterThanOrEqual(0);
  });

  // 12.5: Throws ConflictException when building is full
  it('throws ConflictException when no slots available for car', async () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1 });
    const slots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.occupied, floor: floor1 }),
    ];
    prisma.slot.findMany.mockResolvedValue(slots);

    await expect(service.allocate(VehicleType.car)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException when no slots available for motorbike', async () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1 });
    const slots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.B, vehicleType: VehicleType.motorbike, status: SlotStatus.occupied, floor: floor1 }),
    ];
    prisma.slot.findMany.mockResolvedValue(slots);

    await expect(service.allocate(VehicleType.motorbike)).rejects.toThrow(
      ConflictException,
    );
  });

  // 12.6: Measures allocation time
  it('measures allocation_time_ms', async () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1 });
    const slots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.B, vehicleType: VehicleType.motorbike, status: SlotStatus.available, floor: floor1 }),
    ];
    prisma.slot.findMany.mockResolvedValue(slots);

    const result = await service.allocate(VehicleType.motorbike);

    expect(result.allocationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('uses balanced_occupancy strategy by default', async () => {
    const floor1 = makeFloor({ id: 1, floorNumber: 1 });
    const slots = [
      makeSlot({ id: 1, floorId: 1, zone: Zone.A, vehicleType: VehicleType.car, status: SlotStatus.available, floor: floor1 }),
    ];
    prisma.slot.findMany.mockResolvedValue(slots);

    const result = await service.allocate(VehicleType.car);

    expect(result.allocationStrategy).toBe('balanced_occupancy');
  });

  // getActiveStrategyName
  describe('getActiveStrategyName', () => {
    it('returns config value when set', async () => {
      prisma.systemConfig.findUnique.mockResolvedValue({
        configKey: 'active_allocation_strategy',
        configValue: 'lowest_floor',
      });

      const name = await service.getActiveStrategyName();

      expect(name).toBe('lowest_floor');
    });

    it('returns default strategy name when config not found', async () => {
      prisma.systemConfig.findUnique.mockResolvedValue(null);

      const name = await service.getActiveStrategyName();

      expect(name).toBe('balanced_occupancy');
    });
  });
});
