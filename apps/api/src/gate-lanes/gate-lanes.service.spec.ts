import { ConflictException, ForbiddenException } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { GateLanesService } from './gate-lanes.service';

describe('GateLanesService', () => {
  const prisma = {
    staffGateAssignment: { findUnique: jest.fn() },
    gateLane: { findMany: jest.fn() },
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

  it('returns fixed coverage grouped by lane status', async () => {
    prisma.gateLane.findMany.mockResolvedValue([
      {
        id: 'lane-car', code: 'CAR-001', name: 'Car Lane', vehicleType: VehicleType.car,
        cameraId: null, isActive: true, createdAt: new Date(), updatedAt: new Date(),
        assignments: [{ staffId: 'staff-1', staff: { id: 'staff-1', fullName: 'A Staff', phone: '0900', username: null, isActive: true } }],
      },
      {
        id: 'lane-bike', code: 'MOTORBIKE-001', name: 'Bike Lane', vehicleType: VehicleType.motorbike,
        cameraId: null, isActive: true, createdAt: new Date(), updatedAt: new Date(), assignments: [],
      },
      {
        id: 'lane-off', code: 'CAR-002', name: 'Closed Lane', vehicleType: VehicleType.car,
        cameraId: null, isActive: false, createdAt: new Date(), updatedAt: new Date(), assignments: [],
      },
    ]);

    const coverage = await service.getCurrentCoverage();

    expect(coverage.mode).toBe('fixed_assignment');
    expect(coverage.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(coverage.summary).toEqual({ total: 3, covered: 1, unassigned: 1, inactive: 1 });
    expect(coverage.lanes.map((lane) => lane.status)).toEqual(['fixed_covered', 'fixed_unassigned', 'inactive']);
  });
});
