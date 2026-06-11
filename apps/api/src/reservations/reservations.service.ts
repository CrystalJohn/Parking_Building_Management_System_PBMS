import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VehicleType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from '../slots/allocation.service';
import { CreateReservationDto } from './dto';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  /** Default reservation timeout in minutes (read from SystemConfig at runtime). */
  private static readonly DEFAULT_TIMEOUT_MINUTES = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
  ) {}

  /**
   * 18.1: Create a reservation for a registered driver.
   *
   * Flow:
   * 1. Validate driver has an active account (18.5)
   * 2. P1: Guard — one active reservation per vehicle type per driver
   * 3. Allocate a slot via AllocationService
   * 4. In transaction: set slot → reserved, create Reservation with expires_at
   *
   * Req 8.1, 8.2, 8.3
   */
  async create(dto: CreateReservationDto, driverId: string) {
    // 18.5: Validate driver exists and is active
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { id: true, role: true, isActive: true },
    });

    if (!driver || !driver.isActive || driver.role !== 'driver') {
      throw new ForbiddenException(
        'Only active registered drivers can create reservations',
      );
    }

    // P1: Prevent duplicate active reservations for the same vehicle type
    const existingActive = await this.prisma.reservation.findFirst({
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

    // Read timeout from SystemConfig
    const timeoutMinutes = await this.getTimeoutMinutes();

    // 18.1: Allocate slot using the same strategy as check-in
    const { slot } = await this.allocationService.allocate(dto.vehicleType);

    // Transaction: set slot → reserved, create reservation
    const reservation = await this.prisma.$transaction(async (tx) => {
      // Lock and verify slot is still available
      const lockedSlot = await tx.$queryRaw<{ id: number; status: string }[]>`
        SELECT id, status FROM slots
        WHERE id = ${slot.id} AND status = 'available'
        FOR UPDATE SKIP LOCKED
      `;

      if (!lockedSlot || lockedSlot.length === 0) {
        throw new ConflictException(
          `Slot ${slot.code} is no longer available. Please retry.`,
        );
      }

      // 18.2: Set slot → reserved
      await tx.slot.update({
        where: { id: slot.id },
        data: { status: 'reserved' },
      });

      // 18.2: Create reservation with expires_at = now + timeout
      const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

      const newReservation = await tx.reservation.create({
        data: {
          driverId,
          slotId: slot.id,
          vehicleType: dto.vehicleType,
          expiresAt,
        },
        include: {
          slot: { include: { floor: true } },
        },
      });

      return newReservation;
    });

    return {
      reservation: {
        id: reservation.id,
        vehicleType: reservation.vehicleType,
        status: reservation.status,
        createdAt: reservation.createdAt,
        expiresAt: reservation.expiresAt,
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

  /**
   * 18.3: List reservations for the current driver.
   */
  async findMyReservations(driverId: string) {
    return this.prisma.reservation.findMany({
      where: { driverId },
      include: {
        slot: { include: { floor: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * P0: Get a single reservation by ID.
   * Ownership enforced: driver can only view their own reservation.
   */
  async findOne(reservationId: string, driverId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
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

  /**
   * 18.4: Cancel a reservation and release the slot.
   * Only the owning driver can cancel.
   */
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

    // Transaction: cancel reservation + release slot
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'cancelled' },
      });

      await tx.slot.update({
        where: { id: reservation.slotId },
        data: { status: 'available' },
      });
    });

    return { message: 'Reservation cancelled successfully' };
  }

  /**
   * 19: Reservation timeout sweeper.
   * Runs every minute. Expires reservations past their expires_at time.
   * In transaction: reservation → expired, slot → available.
   * Req 8.4
   */
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

    // Process each expired reservation in a transaction
    for (const reservation of expiredReservations) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.reservation.update({
            where: { id: reservation.id },
            data: { status: 'expired' },
          });

          await tx.slot.update({
            where: { id: reservation.slotId },
            data: { status: 'available' },
          });
        });
      } catch (error) {
        // Log but don't throw — other reservations should still be processed
        this.logger.error(
          `Failed to expire reservation ${reservation.id}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Expired ${expiredReservations.length} reservation(s)`,
    );
  }

  /**
   * Read reservation timeout from SystemConfig.
   */
  private async getTimeoutMinutes(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { configKey: 'reservation_timeout_minutes' },
    });

    if (config?.configValue) {
      const parsed = parseInt(config.configValue, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    return ReservationsService.DEFAULT_TIMEOUT_MINUTES;
  }
}
