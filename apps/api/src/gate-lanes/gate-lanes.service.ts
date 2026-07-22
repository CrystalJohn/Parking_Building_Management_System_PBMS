import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignStaffGateLaneDto, CreateGateLaneDto, UpdateGateLaneDto } from './dto';

const laneSelect = {
  id: true,
  code: true,
  name: true,
  vehicleType: true,
  cameraId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class GateLanesService {
  constructor(private readonly prisma: PrismaService) {}

  async listLanes() {
    return this.prisma.gateLane.findMany({
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      select: {
        ...laneSelect,
        assignments: {
          select: {
            staffId: true,
            assignedAt: true,
            updatedAt: true,
            staff: { select: { id: true, fullName: true, phone: true, username: true, isActive: true } },
          },
        },
      },
    });
  }

  async listStaff() {
    return this.prisma.user.findMany({
      where: { role: Role.staff },
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }, { phone: 'asc' }],
      select: { id: true, fullName: true, phone: true, username: true, isActive: true, gateAssignment: { select: { gateLane: { select: laneSelect } } } },
    });
  }

  async createLane(dto: CreateGateLaneDto) {
    const prefix = dto.vehicleType === VehicleType.car ? 'CAR' : 'MOTORBIKE';
    const existingCount = await this.prisma.gateLane.count({
      where: { vehicleType: dto.vehicleType },
    });

    // The manager names a lane; the system owns the immutable technical code.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `${prefix}-${String(existingCount + attempt + 1).padStart(3, '0')}`;
      try {
        return await this.prisma.gateLane.create({
          data: { ...dto, code },
          select: laneSelect,
        });
      } catch (error) {
        if (!this.isUniqueError(error)) throw error;
      }
    }

    throw new ConflictException('Unable to allocate a unique gate lane code. Please try again.');
  }

  async updateLane(id: string, dto: UpdateGateLaneDto) {
    try {
      return await this.prisma.gateLane.update({ where: { id }, data: dto, select: laneSelect });
    } catch (error) {
      if (this.isNotFoundError(error)) throw new NotFoundException('Gate lane not found.');
      throw error;
    }
  }

  async assignStaff(laneId: string, dto: AssignStaffGateLaneDto, assignedById: string) {
    const [lane, staff] = await Promise.all([
      this.prisma.gateLane.findUnique({ where: { id: laneId }, select: laneSelect }),
      this.prisma.user.findUnique({ where: { id: dto.staffId }, select: { id: true, role: true, isActive: true } }),
    ]);
    if (!lane) throw new NotFoundException('Gate lane not found.');
    if (!staff || staff.role !== Role.staff) throw new BadLaneAssignmentException('Only staff accounts can be assigned to a gate lane.');
    if (!staff.isActive) throw new BadLaneAssignmentException('Inactive staff cannot be assigned to a gate lane.');

    return this.prisma.staffGateAssignment.upsert({
      where: { staffId: dto.staffId },
      create: { staffId: dto.staffId, gateLaneId: laneId, assignedById },
      update: { gateLaneId: laneId, assignedById },
      include: { gateLane: { select: laneSelect }, staff: { select: { id: true, fullName: true, phone: true, username: true } } },
    });
  }

  async unassignStaff(staffId: string) {
    try {
      await this.prisma.staffGateAssignment.delete({ where: { staffId } });
      return { ok: true, staffId };
    } catch (error) {
      if (this.isNotFoundError(error)) throw new NotFoundException('Staff gate assignment not found.');
      throw error;
    }
  }

  async getCurrentAssignment(staffId: string) {
    return this.prisma.staffGateAssignment.findUnique({
      where: { staffId },
      include: { gateLane: { select: laneSelect } },
    });
  }

  async requireActiveLane(staffId: string) {
    const assignment = await this.getCurrentAssignment(staffId);
    if (!assignment) {
      throw new ForbiddenException({
        code: 'GATE_LANE_ASSIGNMENT_REQUIRED',
        message: 'You are not assigned to an active gate lane. Contact a manager for assignment.',
      });
    }
    if (!assignment.gateLane.isActive) {
      throw new ForbiddenException({
        code: 'GATE_LANE_INACTIVE',
        message: 'Your assigned gate lane is inactive. Contact a manager.',
        lane: assignment.gateLane,
      });
    }
    return assignment;
  }

  assertVehicleType(lane: { gateLane: { id: string; code: string; name: string; vehicleType: VehicleType } }, actual: VehicleType) {
    const expected = lane.gateLane.vehicleType;
    if (expected === actual) return;
    throw new ConflictException({
      code: 'WRONG_GATE_LANE',
      message: `Wrong lane. This is a ${actual === VehicleType.car ? 'Car' : 'Motorbike'}. Please use the ${expected === VehicleType.car ? 'Car' : 'Motorbike'} lane.`,
      expectedVehicleType: expected,
      actualVehicleType: actual,
      lane: lane.gateLane,
    });
  }

  async assertStaffVehicleType(staffId: string, actual: VehicleType) {
    const assignment = await this.requireActiveLane(staffId);
    this.assertVehicleType(assignment, actual);
    return assignment;
  }

  private isUniqueError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private isNotFoundError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
  }
}

class BadLaneAssignmentException extends ConflictException {}
