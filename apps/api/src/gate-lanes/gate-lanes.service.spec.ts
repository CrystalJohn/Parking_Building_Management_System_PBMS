import { ConflictException, ForbiddenException } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { GateLanesService } from './gate-lanes.service';

describe('GateLanesService', () => {
  const prisma = {
    staffGateAssignment: { findUnique: jest.fn() },
  } as any;
  const service = new GateLanesService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('blocks staff without an assignment before gate work starts', async () => {
    prisma.staffGateAssignment.findUnique.mockResolvedValue(null);

    await expect(service.requireActiveLane('staff-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks an inactive assigned lane', async () => {
    prisma.staffGateAssignment.findUnique.mockResolvedValue({
      staffId: 'staff-1',
      gateLane: { id: 'lane-1', code: 'CAR-01', name: 'Car Lane 1', vehicleType: VehicleType.car, isActive: false },
    });

    await expect(service.requireActiveLane('staff-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a vehicle that belongs to the other lane type', () => {
    const lane = { gateLane: { id: 'lane-1', code: 'CAR-01', name: 'Car Lane 1', vehicleType: VehicleType.car } };

    expect(() => service.assertVehicleType(lane, VehicleType.motorbike)).toThrow(ConflictException);
  });
});
