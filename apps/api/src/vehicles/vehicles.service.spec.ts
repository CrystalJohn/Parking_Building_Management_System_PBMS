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
