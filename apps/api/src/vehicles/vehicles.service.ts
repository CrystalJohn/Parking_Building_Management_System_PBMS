import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VehicleUserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LinkVehicleUserDto } from './dto';

export interface MatchedVehicleSummary {
  inputPlate: string;
  normalizedPlate: string;
  matched: boolean;
  vehicle: null | {
    id: string;
    plateNumber: string;
    vehicleType: string;
    isActive: boolean;
    registeredAt: Date;
  };
  owner: null | {
    id: string;
    fullName: string | null;
    phone: string;
    email: string | null;
    role: string;
  };
  linkedUsers: Array<{
    id: string;
    fullName: string | null;
    phone: string;
    email: string | null;
    role: string;
  }>;
  activeSubscription: null | {
    id: string;
    planType: string;
    validFrom: Date;
    validTo: Date;
  };
  recentSessions: Array<{
    id: string;
    licensePlate: string;
    plateNumberOcr: string | null;
    plateNumberConfirmed: string | null;
    vehicleType: string;
    status: string;
    checkInTime: Date;
    checkOutTime: Date | null;
    slot: {
      id: number;
      code: string;
      zone: string;
      floor: {
        id: number;
        name: string;
        floorNumber: number;
      };
    };
  }>;
}

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async linkUser(vehicleId: string, dto: LinkVehicleUserDto) {
    const role = dto.role ?? VehicleUserRole.driver;

    const [vehicle, user] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, fullName: true, phone: true, email: true },
      }),
    ]);

    if (!vehicle) {
      throw new NotFoundException(`Vehicle with id "${vehicleId}" not found`);
    }

    if (!user) {
      throw new NotFoundException(`User with id "${dto.userId}" not found`);
    }

    const existingLink = await this.prisma.vehicleUser.findUnique({
      where: {
        vehicleId_userId: {
          vehicleId,
          userId: dto.userId,
        },
      },
      select: { vehicleId: true, userId: true },
    });

    if (existingLink) {
      throw new ConflictException('User is already linked to this vehicle');
    }

    if (role === VehicleUserRole.owner) {
      await this.assertVehicleHasNoOwner(vehicleId);
    }

    try {
      return await this.prisma.vehicleUser.create({
        data: {
          vehicleId,
          userId: dto.userId,
          role,
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          role === VehicleUserRole.owner
            ? 'Vehicle already has an owner'
            : 'User is already linked to this vehicle',
        );
      }

      throw error;
    }
  }

  async matchPlate(plateNumber: string): Promise<MatchedVehicleSummary> {
    const normalizedPlate = normalizePlateNumber(plateNumber);
    if (!normalizedPlate) {
      throw new BadRequestException('plateNumber is required');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        plateNumber: normalizedPlate,
        isActive: true,
      },
      include: {
        vehicleUsers: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
                isActive: true,
              },
            },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
        subscriptions: {
          where: {
            validFrom: { lte: new Date() },
            validTo: { gte: new Date() },
          },
          orderBy: { validTo: 'desc' },
          take: 1,
        },
      },
    });

    if (!vehicle) {
      return {
        inputPlate: plateNumber,
        normalizedPlate,
        matched: false,
        vehicle: null,
        owner: null,
        linkedUsers: [],
        activeSubscription: null,
        recentSessions: [],
      };
    }

    const linkedUsers = vehicle.vehicleUsers
      .filter((link) => link.user.isActive)
      .map((link) => ({
        id: link.user.id,
        fullName: link.user.fullName,
        phone: link.user.phone,
        email: link.user.email,
        role: link.role,
      }));

    const owner =
      linkedUsers.find((user) => user.role === 'owner') ??
      linkedUsers[0] ??
      null;

    const recentSessions = await this.prisma.parkingSession.findMany({
      where: {
        OR: [
          { vehicleId: vehicle.id },
          { plateNumberConfirmed: vehicle.plateNumber },
          { licensePlate: vehicle.plateNumber },
        ],
      },
      orderBy: { checkInTime: 'desc' },
      take: 5,
      include: {
        slot: { include: { floor: true } },
      },
    });

    const activeSubscription = vehicle.subscriptions[0] ?? null;

    return {
      inputPlate: plateNumber,
      normalizedPlate,
      matched: true,
      vehicle: {
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        vehicleType: vehicle.vehicleType,
        isActive: vehicle.isActive,
        registeredAt: vehicle.registeredAt,
      },
      owner,
      linkedUsers,
      activeSubscription: activeSubscription
        ? {
            id: activeSubscription.id,
            planType: activeSubscription.planType,
            validFrom: activeSubscription.validFrom,
            validTo: activeSubscription.validTo,
          }
        : null,
      recentSessions: recentSessions.map((session) => ({
        id: session.id,
        licensePlate: session.licensePlate,
        plateNumberOcr: session.plateNumberOcr,
        plateNumberConfirmed: session.plateNumberConfirmed,
        vehicleType: session.vehicleType,
        status: session.status,
        checkInTime: session.checkInTime,
        checkOutTime: session.checkOutTime,
        slot: {
          id: session.slot.id,
          code: session.slot.code,
          zone: session.slot.zone,
          floor: {
            id: session.slot.floor.id,
            name: session.slot.floor.name,
            floorNumber: session.slot.floor.floorNumber,
          },
        },
      })),
    };
  }

  private async assertVehicleHasNoOwner(vehicleId: string): Promise<void> {
    const existingOwner = await this.prisma.vehicleUser.findFirst({
      where: {
        vehicleId,
        role: VehicleUserRole.owner,
      },
      select: {
        user: {
          select: {
            fullName: true,
            phone: true,
          },
        },
      },
    });

    if (existingOwner) {
      const ownerLabel =
        existingOwner.user.fullName || existingOwner.user.phone || 'another user';

      throw new ConflictException(`Vehicle already has an owner: ${ownerLabel}`);
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}

export function normalizePlateNumber(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
