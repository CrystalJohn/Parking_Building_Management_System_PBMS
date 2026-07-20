import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VehicleUserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';


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

export type VehicleLookupMode = 'WALK_IN' | 'REGISTERED' | 'SUBSCRIBER';

export interface LookupPlateResult {
  inputPlate: string;
  normalizedPlate: string;
  matched: boolean;
  mode: VehicleLookupMode;
  vehicle: MatchedVehicleSummary['vehicle'];
  vehicleType: string | null;
  owner: MatchedVehicleSummary['owner'];
  ownerName: string | null;
  driverCount: number;
  linkedUsers: MatchedVehicleSummary['linkedUsers'];
  subscription: null | {
    id: string;
    planType: string;
    validFrom: Date;
    validTo: Date;
    isActive: boolean;
    isExpired: boolean;
  };
  recentSessions: MatchedVehicleSummary['recentSessions'];
}

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyVehicles(driverId: string) {
    const now = new Date();

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        isActive: true,
        vehicleUsers: {
          some: {
            userId: driverId,
          },
        },
      },
      include: {
        vehicleUsers: {
          where: {
            userId: driverId,
          },
          select: {
            role: true,
            createdAt: true,
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
        subscriptions: {
          where: {
            validFrom: { lte: now },
            validTo: { gte: now },
          },
          orderBy: { validTo: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ vehicleType: 'asc' }, { plateNumber: 'asc' }],
    });

    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      isActive: vehicle.isActive,
      registeredAt: vehicle.registeredAt,
      linkedRole: vehicle.vehicleUsers[0]?.role ?? VehicleUserRole.driver,
      activeSubscription: vehicle.subscriptions[0]
        ? {
            id: vehicle.subscriptions[0].id,
            planType: vehicle.subscriptions[0].planType,
            validFrom: vehicle.subscriptions[0].validFrom,
            validTo: vehicle.subscriptions[0].validTo,
          }
        : null,
    }));
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

  async lookupPlate(plateNumber: string): Promise<LookupPlateResult> {
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
        mode: 'WALK_IN',
        vehicle: null,
        vehicleType: null,
        owner: null,
        ownerName: null,
        driverCount: 0,
        linkedUsers: [],
        subscription: null,
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

    const subscription = vehicle.subscriptions[0] ?? null;
    const now = new Date();
    const subscriptionSummary = subscription
      ? {
          id: subscription.id,
          planType: subscription.planType,
          validFrom: subscription.validFrom,
          validTo: subscription.validTo,
          isActive:
            subscription.validFrom.getTime() <= now.getTime() &&
            subscription.validTo.getTime() >= now.getTime(),
          isExpired: subscription.validTo.getTime() < now.getTime(),
        }
      : null;

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

    return {
      inputPlate: plateNumber,
      normalizedPlate,
      matched: true,
      mode: subscriptionSummary ? 'SUBSCRIBER' : 'REGISTERED',
      vehicle: {
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        vehicleType: vehicle.vehicleType,
        isActive: vehicle.isActive,
        registeredAt: vehicle.registeredAt,
      },
      vehicleType: vehicle.vehicleType,
      owner,
      ownerName: owner?.fullName ?? null,
      driverCount: linkedUsers.length,
      linkedUsers,
      subscription: subscriptionSummary,
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


}

export function normalizePlateNumber(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
