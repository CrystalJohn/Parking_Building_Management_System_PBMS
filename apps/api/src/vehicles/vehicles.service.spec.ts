import { BadRequestException, ConflictException } from '@nestjs/common';
import { VehicleUserRole } from '@prisma/client';
import { VehiclesService, normalizePlateNumber } from './vehicles.service';

describe('VehiclesService', () => {
  let service: VehiclesService;
  let prisma: {
    vehicle: { findFirst: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    vehicleUser: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    parkingSession: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      vehicle: { findFirst: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      vehicleUser: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      parkingSession: { findMany: jest.fn() },
    };
    service = new VehiclesService(prisma as any);
  });

  it('normalizes OCR plate text for matching', () => {
    expect(normalizePlateNumber('99E1-222.68')).toBe('99E122268');
    expect(normalizePlateNumber(' 59a 12345 ')).toBe('59A12345');
  });

  it('returns matched=false when no active vehicle matches', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    const result = await service.matchPlate('99E1-222.68');

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plateNumber: '99E122268', isActive: true },
      }),
    );
    expect(result).toMatchObject({
      normalizedPlate: '99E122268',
      matched: false,
      vehicle: null,
      owner: null,
      linkedUsers: [],
      recentSessions: [],
    });
  });

  it('returns vehicle, default owner, linked users, subscription, and recent sessions', async () => {
    const validFrom = new Date('2026-06-01T00:00:00.000Z');
    const validTo = new Date('2026-07-01T00:00:00.000Z');
    const checkInTime = new Date('2026-06-30T01:00:00.000Z');

    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-1',
      plateNumber: '99E122268',
      vehicleType: 'car',
      isActive: true,
      registeredAt: new Date('2026-06-01T00:00:00.000Z'),
      vehicleUsers: [
        {
          role: 'driver',
          user: {
            id: 'user-driver',
            fullName: 'Driver B',
            phone: '0900000002',
            email: null,
            isActive: true,
          },
        },
        {
          role: 'owner',
          user: {
            id: 'user-owner',
            fullName: 'Owner A',
            phone: '0900000001',
            email: 'owner@example.com',
            isActive: true,
          },
        },
      ],
      subscriptions: [
        {
          id: 'subscription-1',
          planType: 'monthly',
          validFrom,
          validTo,
        },
      ],
    });
    prisma.parkingSession.findMany.mockResolvedValue([
      {
        id: 'session-1',
        licensePlate: '99E122268',
        plateNumberOcr: '99E122268',
        plateNumberConfirmed: '99E122268',
        vehicleType: 'car',
        status: 'active',
        checkInTime,
        checkOutTime: null,
        slot: {
          id: 1,
          code: 'T1-A-01',
          zone: 'A',
          floor: { id: 1, name: 'T1', floorNumber: 1 },
        },
      },
    ]);

    const result = await service.matchPlate('99E1-222.68');

    expect(result.matched).toBe(true);
    expect(result.vehicle?.id).toBe('vehicle-1');
    expect(result.owner).toMatchObject({
      id: 'user-owner',
      fullName: 'Owner A',
      role: 'owner',
    });
    expect(result.linkedUsers).toHaveLength(2);
    expect(result.activeSubscription).toMatchObject({
      id: 'subscription-1',
      planType: 'monthly',
    });
    expect(result.recentSessions).toHaveLength(1);
  });

  it('rejects an empty plate number', async () => {
    await expect(service.matchPlate('')).rejects.toThrow(BadRequestException);
  });

  it('lookupPlate returns WALK_IN when no vehicle matches', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    const result = await service.lookupPlate('00A-00000');

    expect(result).toMatchObject({
      normalizedPlate: '00A00000',
      matched: false,
      mode: 'WALK_IN',
      vehicleType: null,
      ownerName: null,
      driverCount: 0,
      subscription: null,
    });
    expect(prisma.parkingSession.findMany).not.toHaveBeenCalled();
  });

  it('lookupPlate returns SUBSCRIBER with owner, drivers, and active subscription', async () => {
    const now = Date.now();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-1',
      plateNumber: '92CA00001',
      vehicleType: 'motorbike',
      isActive: true,
      registeredAt: new Date('2026-06-01T00:00:00.000Z'),
      vehicleUsers: [
        {
          role: 'owner',
          user: {
            id: 'owner-1',
            fullName: 'Nguyen Van A',
            phone: '0900000001',
            email: null,
            isActive: true,
          },
        },
        {
          role: 'driver',
          user: {
            id: 'driver-1',
            fullName: 'Tran Thi B',
            phone: '0900000002',
            email: null,
            isActive: true,
          },
        },
      ],
      subscriptions: [
        {
          id: 'subscription-active',
          planType: 'monthly',
          validFrom: new Date(now - 24 * 60 * 60 * 1000),
          validTo: new Date(now + 24 * 60 * 60 * 1000),
        },
      ],
    });
    prisma.parkingSession.findMany.mockResolvedValue([]);

    const result = await service.lookupPlate('92CA-00001');

    expect(result).toMatchObject({
      matched: true,
      mode: 'SUBSCRIBER',
      vehicleType: 'motorbike',
      ownerName: 'Nguyen Van A',
      driverCount: 2,
      subscription: {
        id: 'subscription-active',
        planType: 'monthly',
        isActive: true,
        isExpired: false,
      },
    });
  });

  it('lookupPlate returns expired subscription details for frontend warning', async () => {
    const now = Date.now();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-2',
      plateNumber: '92CA00002',
      vehicleType: 'car',
      isActive: true,
      registeredAt: new Date('2026-06-01T00:00:00.000Z'),
      vehicleUsers: [],
      subscriptions: [
        {
          id: 'subscription-expired',
          planType: 'monthly',
          validFrom: new Date(now - 60 * 24 * 60 * 60 * 1000),
          validTo: new Date(now - 24 * 60 * 60 * 1000),
        },
      ],
    });
    prisma.parkingSession.findMany.mockResolvedValue([]);

    const result = await service.lookupPlate('92CA-00002');

    expect(result).toMatchObject({
      matched: true,
      mode: 'SUBSCRIBER',
      vehicleType: 'car',
      subscription: {
        id: 'subscription-expired',
        isActive: false,
        isExpired: true,
      },
    });
  });

  it('lookupPlate returns REGISTERED when vehicle has no subscription', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-3',
      plateNumber: '59T99999',
      vehicleType: 'motorbike',
      isActive: true,
      registeredAt: new Date('2026-06-01T00:00:00.000Z'),
      vehicleUsers: [],
      subscriptions: [],
    });
    prisma.parkingSession.findMany.mockResolvedValue([]);

    const result = await service.lookupPlate('59T-99999');

    expect(result).toMatchObject({
      matched: true,
      mode: 'REGISTERED',
      vehicleType: 'motorbike',
      subscription: null,
    });
  });

  it('links a driver to a vehicle', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-driver',
      fullName: 'Driver B',
      phone: '0900000002',
      email: null,
    });
    prisma.vehicleUser.findUnique.mockResolvedValue(null);
    prisma.vehicleUser.create.mockResolvedValue({
      vehicleId: 'vehicle-1',
      userId: 'user-driver',
      role: VehicleUserRole.driver,
      user: {
        id: 'user-driver',
        fullName: 'Driver B',
        phone: '0900000002',
        email: null,
      },
    });

    const result = await service.linkUser('vehicle-1', {
      userId: 'user-driver',
      role: VehicleUserRole.driver,
    });

    expect(prisma.vehicleUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.vehicleUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          vehicleId: 'vehicle-1',
          userId: 'user-driver',
          role: VehicleUserRole.driver,
        },
      }),
    );
    expect(result.role).toBe(VehicleUserRole.driver);
  });

  it('defaults a linked user to driver when role is omitted', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-driver',
      fullName: 'Driver B',
      phone: '0900000002',
      email: null,
    });
    prisma.vehicleUser.findUnique.mockResolvedValue(null);
    prisma.vehicleUser.create.mockResolvedValue({
      vehicleId: 'vehicle-1',
      userId: 'user-driver',
      role: VehicleUserRole.driver,
    });

    await service.linkUser('vehicle-1', { userId: 'user-driver' } as any);

    expect(prisma.vehicleUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          vehicleId: 'vehicle-1',
          userId: 'user-driver',
          role: VehicleUserRole.driver,
        },
      }),
    );
  });

  it('rejects adding a second owner before hitting the database constraint', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-next-owner',
      fullName: 'Next Owner',
      phone: '0900000003',
      email: null,
    });
    prisma.vehicleUser.findUnique.mockResolvedValue(null);
    prisma.vehicleUser.findFirst.mockResolvedValue({
      user: {
        fullName: 'Owner A',
        phone: '0900000001',
      },
    });

    await expect(
      service.linkUser('vehicle-1', {
        userId: 'user-next-owner',
        role: VehicleUserRole.owner,
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.vehicleUser.create).not.toHaveBeenCalled();
  });

  it('maps unique owner index races to a clean conflict error', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'vehicle-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-owner',
      fullName: 'Owner A',
      phone: '0900000001',
      email: null,
    });
    prisma.vehicleUser.findUnique.mockResolvedValue(null);
    prisma.vehicleUser.findFirst.mockResolvedValue(null);
    prisma.vehicleUser.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: 'vehicle_users_single_owner_idx' },
    });

    await expect(
      service.linkUser('vehicle-1', {
        userId: 'user-owner',
        role: VehicleUserRole.owner,
      }),
    ).rejects.toThrow('Vehicle already has an owner');
  });
});
