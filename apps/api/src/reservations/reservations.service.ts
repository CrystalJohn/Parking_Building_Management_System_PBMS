import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, Prisma, VehicleType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePlateNumber } from '../vehicles/vehicles.service';
import { PlateFormatter } from '../plates';
import { AllocationService } from '../slots/allocation.service';
import { PricingResolver } from '../config-mgmt/pricing-resolver.service';
import {
  RESERVATION_CHECKIN_TOKEN_REFRESH_MS,
  RESERVATION_CHECKIN_TOKEN_TTL_SECONDS,
  RESERVATION_CHECKIN_TOKEN_TYPE,
  type ReservationCheckInTokenPayload,
} from './reservation-checkin-qr';
import { CreateReservationDto } from './dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

export interface ReservationQuotaSnapshot {
  limit: number;
  remaining: number;
  windowResetAt: Date;
  cooldownUntil: Date | null;
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  private static readonly DEFAULT_TIMEOUT_MINUTES = 60;
  private static readonly MAX_ADVANCE_MINUTES = 120;
  private static readonly MAX_SLOT_LOCK_ATTEMPTS = 3;
  private static readonly RESERVATION_RATE_LIMIT = 5;
  private static readonly RESERVATION_RATE_WINDOW_MS = 10 * 60_000;
  private static readonly RESERVATION_CANCEL_COOLDOWN_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
    private readonly resolver: PricingResolver,
  ) {}

  /**
   * Final reservation model:
   * - slot.status is current physical/hold state.
   * - `available` means free now, `reserved` means held by a short-term reservation,
   *   `occupied` means a vehicle is physically parked, and `maintenance` is closed.
   * - reservation is a 60-minute short-term hold to arrive soon; no advance
   *   booking/overlap model is used.
   */
  async create(dto: CreateReservationDto, driverId: string) {
    const plannedArrivalAt = this.parsePlannedArrival(dto.plannedArrivalAt);

    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { id: true, role: true, isActive: true },
    });

    if (!driver || !driver.isActive || driver.role !== 'driver') {
      throw new ForbiddenException(
        'Only active registered drivers can create reservations',
      );
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: dto.vehicleId,
        isActive: true,
        vehicleUsers: {
          some: {
            userId: driverId,
          },
        },
      },
      select: {
        id: true,
        plateNumber: true,
        vehicleType: true,
      },
    });

    if (!vehicle) {
      throw new ForbiddenException(
        'Selected vehicle is not linked to your account or is inactive.',
      );
    }

    const reservation = await this.mapReservationConflict(vehicle.vehicleType, async () =>
      this.runWithSerializableRetry(async () =>
        this.prisma.$transaction(
          async (tx) => {
            const quota = await this.getQuotaSnapshot(driverId, new Date(), tx);

            if (quota.cooldownUntil && quota.cooldownUntil.getTime() > Date.now()) {
              throw this.quotaError(
                'RESERVATION_COOLDOWN',
                'You cancelled a reservation recently. Please wait before creating another one.',
                quota,
              );
            }

            if (quota.remaining <= 0) {
              throw this.quotaError(
                'RESERVATION_RATE_LIMITED',
                'Reservation limit reached. Please try again after the quota window resets.',
                quota,
              );
            }

            const existingActive = await tx.reservation.findFirst({
              where: {
                status: 'active',
                OR: [
                  { driverId },
                  { vehicleId: vehicle.id },
                ],
              },
              select: { id: true, driverId: true, vehicleId: true },
            });

            if (existingActive) {
              throw new ConflictException(
                existingActive.vehicleId === vehicle.id
                  ? `Vehicle ${vehicle.plateNumber} already has an active reservation.`
                  : 'You already have an active reservation. Cancel it before creating a new one.',
              );
            }

            const timeoutMinutes = await this.getTimeoutMinutes(tx);
            const excludedSlotIds = new Set<number>();

            for (
              let attempt = 1;
              attempt <= ReservationsService.MAX_SLOT_LOCK_ATTEMPTS;
              attempt++
            ) {
              const { slot } = await this.allocationService.allocate(
                vehicle.vehicleType,
                undefined,
                tx,
                excludedSlotIds,
              );
              const lockedSlot = await this.lockAvailableSlot(tx, slot.id);

              if (!lockedSlot) {
                excludedSlotIds.add(slot.id);
                continue;
              }

              await tx.slot.update({
                where: { id: slot.id },
                data: { status: 'reserved' },
              });

              const expiresAt = new Date(
                plannedArrivalAt.getTime() + timeoutMinutes * 60_000,
              );

              // BR-06/BR-09: Price lock-in — calculate estimated cost and snapshot
              const estimatedEnd = new Date(
                plannedArrivalAt.getTime() + timeoutMinutes * 60_000,
              );
              const segmented = await this.resolver.calculateSegmentedCost(
                vehicle.vehicleType,
                plannedArrivalAt,
                estimatedEnd,
              );
              const activeRate = await this.resolver.getActiveRate(
                vehicle.vehicleType,
                plannedArrivalAt,
              );
              const pricing = await this.prisma.pricingConfig.findFirst({
                where: { vehicleType: vehicle.vehicleType },
              });
              const discountPercent = pricing?.reservationDiscountPercent ?? 20;
              const estimatedCost = Math.round(
                segmented.totalCost * (1 - discountPercent / 100),
              );

              return tx.reservation.create({
                data: {
                  driverId,
                  slotId: slot.id,
                  vehicleId: vehicle.id,
                  vehicleType: vehicle.vehicleType,
                  plannedArrivalAt,
                  expiresAt,
                  estimatedCost,
                  lockedRateTableId: activeRate.id,
                  lockedHourlyRate: activeRate.hourlyRate,
                  pricedAt: new Date(),
                },
                include: {
                  driver: { select: { fullName: true, phone: true } },
                  slot: { include: { floor: true } },
                  vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
                },
              });
            }

            throw new ConflictException('No slot available for this time');
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000, maxWait: 20000 },
        ),
      ),
    );

    this.logger.log(
      `Reservation created | reservationId=${reservation.id} driverId=${driverId} vehicleId=${reservation.vehicleId ?? 'unknown'} plate=${reservation.vehicle?.plateNumber ?? 'unknown'} vehicleType=${reservation.vehicleType} slotId=${reservation.slotId} slotCode=${reservation.slot.code} expiresAt=${reservation.expiresAt.toISOString()}`,
    );

    return {
      quota: await this.getQuotaSnapshot(driverId),
      reservation: {
        id: reservation.id,
        vehicleId: reservation.vehicleId,
        vehicleType: reservation.vehicleType,
        licensePlate: reservation.vehicle?.plateNumber ?? null,
        plannedArrivalAt: reservation.plannedArrivalAt,
        status: reservation.status,
        createdAt: reservation.createdAt,
        expiresAt: reservation.expiresAt,
        driver: reservation.driver,
        vehicle: reservation.vehicle
          ? {
              id: reservation.vehicle.id,
              plateNumber: reservation.vehicle.plateNumber,
              vehicleType: reservation.vehicle.vehicleType,
            }
          : null,
      },
      pricing: {
        estimatedCost: reservation.estimatedCost,
        lockedHourlyRate: reservation.lockedHourlyRate,
        lockedRateTableId: reservation.lockedRateTableId,
        pricedAt: reservation.pricedAt,
      },
      slot: {
        id: reservation.slot.id,
        code: reservation.slot.code,
        zone: reservation.slot.zone,
        floor: {
          id: reservation.slot.floor.id,
          floorNumber: reservation.slot.floor.floorNumber,
          name: reservation.slot.floor.name,
        },
      },
    };
  }

  async findMyReservations(driverId: string) {
    const reservations = await this.prisma.reservation.findMany({
      where: { driverId },
      include: {
        driver: { select: { fullName: true, phone: true } },
        slot: { include: { floor: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reservations.map((reservation) => this.mapReservationDetail(reservation));
  }

  async findOne(reservationId: string, driverId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        driver: { select: { fullName: true, phone: true } },
        slot: { include: { floor: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation not found: ${reservationId}`);
    }

    // BOLA: ownership mismatch returns 404 (not 403) so a driver cannot
    // enumerate other users' reservation IDs.
    if (reservation.driverId !== driverId) {
      throw new NotFoundException(`Reservation not found: ${reservationId}`);
    }

    return this.mapReservationDetail(reservation);
  }

  /**
   * Finds an active reservation whose linked vehicle matches the canonical plate.
   * ALWAYS search by canonical - never by display.
   */
  async findActiveByCanonicalPlate(canonicalPlate: string) {
    if (!canonicalPlate) {
      throw new BadRequestException('canonicalPlate is required');
    }
    const normalized = normalizePlateNumber(canonicalPlate);
    return this.prisma.reservation.findFirst({
      where: {
        status: 'active',
        vehicle: { plateNumber: normalized },
      },
      include: {
        slot: { include: { floor: true } },
        vehicle: true,
      },
    });
  }

  async getCheckInQr(reservationId: string, driverId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        slot: { include: { floor: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation not found: ${reservationId}`);
    }

    // BOLA: ownership mismatch returns 404 (not 403) to avoid ID enumeration.
    if (reservation.driverId !== driverId) {
      throw new NotFoundException(`Reservation not found: ${reservationId}`);
    }

    if (reservation.status !== 'active') {
      throw new ConflictException(
        `Reservation is ${reservation.status}. QR is only available while active.`,
      );
    }

    if (reservation.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Reservation has expired. QR is no longer valid.');
    }

    if (!reservation.vehicleId || !reservation.vehicle) {
      throw new ConflictException(
        'This reservation is missing a linked vehicle. Please use OCR / walk-in fallback.',
      );
    }

    const tokenPayload: ReservationCheckInTokenPayload = {
      typ: RESERVATION_CHECKIN_TOKEN_TYPE,
      reservationId: reservation.id,
      vehicleId: reservation.vehicleId,
      driverId,
    };
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 300 * 1000);
    const token = await this.jwtService.signAsync(tokenPayload, {
      expiresIn: '300s',
    });

    return {
      reservationId: reservation.id,
      token,
      issuedAt,
      expiresAt,
      refreshAfterMs: 270_000,
      vehicle: {
        id: reservation.vehicle.id,
        plateNumber: reservation.vehicle.plateNumber,
        vehicleType: reservation.vehicle.vehicleType,
      },
      slot: {
        id: reservation.slot.id,
        code: reservation.slot.code,
        zone: reservation.slot.zone,
        floor: {
          id: reservation.slot.floor.id,
          floorNumber: reservation.slot.floor.floorNumber,
          name: reservation.slot.floor.name,
        },
      },
    };
  }

  async cancel(reservationId: string, driverId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { slot: true },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation not found: ${reservationId}`);
    }

    // BOLA: ownership mismatch returns 404 (not 403) to avoid ID enumeration.
    if (reservation.driverId !== driverId) {
      throw new NotFoundException(`Reservation not found: ${reservationId}`);
    }

    if (reservation.status !== 'active') {
      throw new ConflictException(
        `Reservation is already ${reservation.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });

      await tx.slot.updateMany({
        where: { id: reservation.slotId, status: 'reserved' },
        data: { status: 'available' },
      });
    }, { timeout: 15000, maxWait: 20000 });

    this.logger.log(
      `Reservation cancelled | reservationId=${reservationId} driverId=${driverId} slotId=${reservation.slotId}`,
    );

    return {
      message: 'Reservation cancelled successfully',
      quota: await this.getQuotaSnapshot(driverId),
    };
  }

  async getQuota(driverId: string) {
    return this.getQuotaSnapshot(driverId);
  }

  private async getQuotaSnapshot(
    driverId: string,
    now = new Date(),
    client: PrismaLike = this.prisma,
  ): Promise<ReservationQuotaSnapshot> {
    const windowStart = new Date(
      now.getTime() - ReservationsService.RESERVATION_RATE_WINDOW_MS,
    );
    const recent = await client.reservation.findMany({
      where: { driverId, createdAt: { gte: windowStart } },
      select: { createdAt: true, cancelledAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const latestCancelled = recent.reduce<Date | null>((latest, reservation) => {
      if (!reservation.cancelledAt) return latest;
      return !latest || reservation.cancelledAt > latest
        ? reservation.cancelledAt
        : latest;
    }, null);
    const cooldownUntil = latestCancelled
      ? new Date(
          latestCancelled.getTime() +
            ReservationsService.RESERVATION_CANCEL_COOLDOWN_MS,
        )
      : null;

    return {
      limit: ReservationsService.RESERVATION_RATE_LIMIT,
      remaining: Math.max(
        0,
        ReservationsService.RESERVATION_RATE_LIMIT - recent.length,
      ),
      windowResetAt: recent[0]
        ? new Date(
            recent[0].createdAt.getTime() +
              ReservationsService.RESERVATION_RATE_WINDOW_MS,
          )
        : new Date(now.getTime() + ReservationsService.RESERVATION_RATE_WINDOW_MS),
      cooldownUntil:
        cooldownUntil && cooldownUntil.getTime() > now.getTime()
          ? cooldownUntil
          : null,
    };
  }

  private quotaError(
    code: 'RESERVATION_RATE_LIMITED' | 'RESERVATION_COOLDOWN',
    message: string,
    quota: ReservationQuotaSnapshot,
  ) {
    return new HttpException(
      { code, message, quota },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredReservations() {
    const now = new Date();

    const expiredReservations = await this.prisma.reservation.findMany({
      where: {
        status: 'active',
        expiresAt: { lt: now },
      },
      select: { id: true, slotId: true },
    });

    if (expiredReservations.length === 0) return;

    for (const reservation of expiredReservations) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.reservation.update({
            where: { id: reservation.id },
            data: { status: 'expired' },
          });

          await tx.slot.updateMany({
            where: { id: reservation.slotId, status: 'reserved' },
            data: { status: 'available' },
          });
        }, { timeout: 15000, maxWait: 20000 });

        this.logger.log(
          `Reservation expired | reservationId=${reservation.id} slotId=${reservation.slotId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to expire reservation ${reservation.id}: ${error}`,
        );
      }
    }

    this.logger.log(`Expired ${expiredReservations.length} reservation(s)`);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async warnExpiringReservations() {
    const soon = new Date(Date.now() + 5 * 60_000);
    const expiringReservations = await this.prisma.reservation.findMany({
      where: {
        status: 'active',
        expiresAt: { lte: soon, gt: new Date() },
        remindedAt: null,
      },
      include: {
        vehicle: {
          select: {
            plateNumber: true,
          },
        },
      },
    });

    for (const reservation of expiringReservations) {
      try {
        await this.notificationsService.createForUser({
          userId: reservation.driverId,
          type: NotificationType.reservation_expiring_soon,
          title: 'Reservation expiring soon',
          message: `Reservation for ${reservation.vehicle?.plateNumber ?? reservation.vehicleType} expires at ${reservation.expiresAt.toISOString()}.`,
          relatedReservationId: reservation.id,
        });

        await this.prisma.reservation.update({
          where: { id: reservation.id },
          data: { remindedAt: new Date() },
        });
      } catch (error) {
        this.logger.error(
          `Failed to notify expiring reservation ${reservation.id}: ${error}`,
        );
      }
    }
  }

  private async getTimeoutMinutes(client: PrismaLike = this.prisma): Promise<number> {
    const config = await client.systemConfig.findUnique({
      where: { configKey: 'reservation_timeout_minutes' },
    });

    if (config?.configValue) {
      const parsed = parseInt(config.configValue, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    return ReservationsService.DEFAULT_TIMEOUT_MINUTES;
  }

  private async runWithSerializableRetry<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (!isSerializationFailure(error) || attempt === maxAttempts) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
  }

  private async mapReservationConflict<T>(
    vehicleType: VehicleType,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `You already have an active ${vehicleType} reservation. Cancel it first.`,
        );
      }
      throw error;
    }
  }

  private async lockAvailableSlot(
    tx: Prisma.TransactionClient,
    slotId: number,
  ): Promise<{ id: number; status: string } | null> {
    const rows = await tx.$queryRaw<{ id: number; status: string }[]>`
      SELECT id, status FROM slots
      WHERE id = ${slotId} AND status = ${'available'}::"SlotStatus"
      FOR UPDATE SKIP LOCKED
    `;

    return rows[0] ?? null;
  }

  private parsePlannedArrival(value?: string): Date {
    const plannedArrivalAt = value ? new Date(value) : new Date();

    if (Number.isNaN(plannedArrivalAt.getTime())) {
      throw new BadRequestException('plannedArrivalAt must be a valid ISO date string');
    }

    const now = new Date();
    if (plannedArrivalAt.getTime() < now.getTime()) {
      throw new BadRequestException('Arrival time cannot be in the past');
    }

    const maxArrival = new Date(
      now.getTime() + ReservationsService.MAX_ADVANCE_MINUTES * 60_000,
    );
    if (plannedArrivalAt.getTime() > maxArrival.getTime()) {
      throw new BadRequestException(
        'You can only reserve for arrival within the next 2 hours',
      );
    }

    return plannedArrivalAt;
  }

  private mapReservationDetail(reservation: {
    id: string;
    driverId: string;
    slotId: number;
    vehicleId: string | null;
    vehicleType: VehicleType;
    plannedArrivalAt: Date | null;
    status: string;
    createdAt: Date;
    expiresAt: Date;
    driver?: { fullName: string | null; phone: string | null } | null;
    slot?: {
      id: number;
      code: string;
      zone: string;
      floorId?: number;
      floor?: { id: number; floorNumber: number; name: string } | null;
    } | null;
    vehicle?: { id: string; plateNumber: string; vehicleType: VehicleType } | null;
  }) {
    return {
      ...reservation,
      licensePlate: reservation.vehicle?.plateNumber ?? null,
      plateDisplay: reservation.vehicle ? PlateFormatter.toDisplay(reservation.vehicle.plateNumber) : null,
      vehicle: reservation.vehicle
        ? {
            id: reservation.vehicle.id,
            plateNumber: reservation.vehicle.plateNumber,
            vehicleType: reservation.vehicle.vehicleType,
          }
        : null,
    };
  }

  async findAll(date?: string) {
    const where: any = {};
    if (date) {
      const dayStart = new Date(date + 'T00:00:00+07:00');
      const dayEnd = new Date(date + 'T23:59:59.999+07:00');
      where.createdAt = { gte: dayStart, lte: dayEnd };
    }
    const reservations = await this.prisma.reservation.findMany({
      where,
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        driver: { select: { id: true, fullName: true, phone: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
        slot: {
          select: {
            id: true,
            code: true,
            zone: true,
            floor: { select: { id: true, floorNumber: true, name: true } },
          },
        },
      },
    });
    return reservations.map((r) => this.mapReservationDetail(r as any));
  }
}

function isSerializationFailure(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    meta?: { code?: string };
    cause?: { code?: string };
  };

  return (
    candidate?.code === 'P2034' ||
    candidate?.meta?.code === '40001' ||
    candidate?.cause?.code === '40001'
  );
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    meta?: { code?: string; constraint?: string; target?: string[] };
    cause?: { code?: string };
  };

  return (
    candidate?.code === 'P2002' ||
    candidate?.meta?.code === '23505' ||
    candidate?.cause?.code === '23505'
  );
}
