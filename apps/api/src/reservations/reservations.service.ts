import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from '../slots/allocation.service';
import { CreateReservationDto } from './dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  private static readonly DEFAULT_TIMEOUT_MINUTES = 60;
  private static readonly MAX_ADVANCE_MINUTES = 120;
  private static readonly MAX_SLOT_LOCK_ATTEMPTS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
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

    const reservation = await this.mapReservationConflict(dto.vehicleType, async () =>
      this.runWithSerializableRetry(async () =>
        this.prisma.$transaction(
          async (tx) => {
            const existingActive = await tx.reservation.findFirst({
              where: {
                driverId,
                vehicleType: dto.vehicleType,
                status: 'active',
              },
              select: { id: true },
            });

            if (existingActive) {
              throw new ConflictException(
                `You already have an active ${dto.vehicleType} reservation. Cancel it before creating a new one.`,
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
                dto.vehicleType,
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

              return tx.reservation.create({
                data: {
                  driverId,
                  slotId: slot.id,
                  vehicleType: dto.vehicleType,
                  plannedArrivalAt,
                  expiresAt,
                },
                include: {
                  driver: { select: { fullName: true, phone: true } },
                  slot: { include: { floor: true } },
                },
              });
            }

            throw new ConflictException('No slot available for this time');
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      ),
    );

    this.logger.log(
      `Reservation created | reservationId=${reservation.id} driverId=${driverId} vehicleType=${reservation.vehicleType} slotId=${reservation.slotId} slotCode=${reservation.slot.code} expiresAt=${reservation.expiresAt.toISOString()}`,
    );

    return {
      reservation: {
        id: reservation.id,
        vehicleType: reservation.vehicleType,
        plannedArrivalAt: reservation.plannedArrivalAt,
        status: reservation.status,
        createdAt: reservation.createdAt,
        expiresAt: reservation.expiresAt,
        driver: reservation.driver,
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
    return this.prisma.reservation.findMany({
      where: { driverId },
      include: {
        driver: { select: { fullName: true, phone: true } },
        slot: { include: { floor: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(reservationId: string, driverId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        driver: { select: { fullName: true, phone: true } },
        slot: { include: { floor: true } },
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation not found: ${reservationId}`);
    }

    if (reservation.driverId !== driverId) {
      throw new ForbiddenException('You can only view your own reservations');
    }

    return reservation;
  }

  async cancel(reservationId: string, driverId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { slot: true },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation not found: ${reservationId}`);
    }

    if (reservation.driverId !== driverId) {
      throw new ForbiddenException('You can only cancel your own reservations');
    }

    if (reservation.status !== 'active') {
      throw new ConflictException(
        `Reservation is already ${reservation.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'cancelled' },
      });

      await tx.slot.updateMany({
        where: { id: reservation.slotId, status: 'reserved' },
        data: { status: 'available' },
      });
    });

    this.logger.log(
      `Reservation cancelled | reservationId=${reservationId} driverId=${driverId} slotId=${reservation.slotId}`,
    );

    return { message: 'Reservation cancelled successfully' };
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
        });

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
