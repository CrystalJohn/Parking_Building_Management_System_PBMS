import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, VehicleType, PaymentMethod } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from '../slots/allocation.service';
import { FeesService, FeeBreakdown } from '../fees/fees.service';
import { VehicleIdentificationService } from '../vehicle-identification/vehicle-identification.service';
import type { VehicleIdentityResult } from '../vehicle-identification/vehicle-identity.types';
import { normalizePlateNumber } from '../vehicles/vehicles.service';
import {
  RESERVATION_CHECKIN_TOKEN_TYPE,
  type ReservationCheckInTokenPayload,
} from '../reservations/reservation-checkin-qr';
import { CheckInDto, CheckOutDto, ConfirmPaymentDto, LostTicketDto } from './dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly feesService: FeesService,
    private readonly vehicleIdentificationService: VehicleIdentificationService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Recent sessions for the gate history card.
   * type=checkin  → sessions ordered by check_in_time desc (all statuses)
   * type=checkout → sessions that have been checked out (completed/exit_authorized)
   */
  async findRecent(type?: 'checkin' | 'checkout', limit = 20) {
    const where =
      type === 'checkout'
        ? { status: { in: ['completed', 'exit_authorized', 'checkout_pending'] as any } }
        : {};

    const orderBy =
      type === 'checkout'
        ? [{ checkOutTime: 'desc' as const }, { checkInTime: 'desc' as const }]
        : [{ checkInTime: 'desc' as const }];

    const sessions = await this.prisma.parkingSession.findMany({
      where,
      orderBy,
      take: Math.min(limit, 50),
      include: {
        slot: { include: { floor: true } },
        payment: { select: { method: true, status: true, amount: true } },
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      sessionCode: s.sessionCode,
      licensePlate: s.licensePlate,
      vehicleType: s.vehicleType,
      status: s.status,
      checkInTime: s.checkInTime,
      checkOutTime: s.checkOutTime,
      slot: {
        code: s.slot.code,
        zone: s.slot.zone,
        floor: s.slot.floor.name,
        floorNumber: s.slot.floor.floorNumber,
      },
      payment: s.payment
        ? {
            method: (s.payment as any).method,
            status: (s.payment as any).status,
            amount: (s.payment as any).amount,
          }
        : null,
      feeAmount: s.feeAmount,
      penaltyAmount: s.penaltyAmount,
    }));
  }

  /**
   * 13.1–13.6 + Task 20 + P1-B: Check-in a vehicle.
   *
   * Flow:
   * 1. [P1-B] Delegate identification to VehicleIdentificationService
   *    → resolves licensePlate / reservationId from the identity result
   * 2. Validate no active session already exists for this plate
   * 3. Optionally resolve registered driver by phone (or from reservation)
   * 4. If identity has a reservationId → fulfill it (use reserved slot, skip allocation)
   * 5. Otherwise allocate a slot via AllocationService
   * 6. Inside a transaction: update slot → occupied, create ParkingSession
   * 7. If driver is registered, generate a QR code (UUID encoded)
   * 8. Return session + slot + optional QR code
   *
   * Req 1.1–1.5, 3.6, 8
   */
  async checkIn(dto: CheckInDto, staffId: string) {
    // ─── P1-B: Identification (separated from business logic) ────────────
    const identity: VehicleIdentityResult =
      await this.vehicleIdentificationService.identifyForCheckIn({
        licensePlate: dto.licensePlate,
        reservationId: dto.reservationId ?? dto.reservationCode,
        driverPhone: dto.driverPhone,
        identificationConfidence: dto.identificationConfidence,
      });

    // Use the normalized plate from the identity result
    const licensePlate = identity.licensePlate ?? dto.licensePlate;
    const plateNumberConfirmed = normalizePlateNumber(licensePlate);
    const plateNumberOcr =
      identity.source === 'OCR'
        ? normalizePlateNumber(identity.licensePlate)
        : null;

    // Resolve registered driver (optional — via phone or from reservation owner)
    let driverId: string | null = null;
    if (dto.driverPhone) {
      const driver = await this.prisma.user.findUnique({
        where: { phone: dto.driverPhone },
        select: { id: true, isActive: true },
      });
      if (driver?.isActive) {
        driverId = driver.id;
      }
    }

    const matchedVehicle = plateNumberConfirmed
      ? await this.prisma.vehicle.findFirst({
          where: {
            plateNumber: plateNumberConfirmed,
            isActive: true,
          },
          include: {
            vehicleUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    isActive: true,
                  },
                },
              },
              orderBy: [{ role: 'asc' as const }, { createdAt: 'asc' as const }],
            },
          },
        })
      : null;

    const vehicleOwner =
      matchedVehicle?.vehicleUsers.find((link) => link.role === 'owner' && link.user.isActive) ??
      matchedVehicle?.vehicleUsers.find((link) => link.user.isActive) ??
      null;

    if (!driverId && vehicleOwner) {
      driverId = vehicleOwner.user.id;
    }

    // ─── Reservation resolution (business logic) ──────────────────────────
    // The identity result already tells us if a reservation was confirmed.
    // Here we load the full reservation record needed for the transaction.
    let reservationId: string | null = null;
    let slot: { id: number; code: string; zone: any; floor: any; floorId: number; slotNumber: number; status: any; vehicleType: any };
    let allocationStrategy: string;
    let allocationTimeMs: number;

    let activeReservation: {
      id: string;
      driverId: string;
      slotId: number;
      vehicleType: any;
      status: string;
      expiresAt?: Date | null;
      slot: any;
    } | null = null;

    if (identity.reservationId) {
      // Identity confirmed a reservation — load the full record for the transaction.
      // IMPORTANT: identity.reservationId is authoritative. If the reservation is
      // invalid here, we must reject — NOT fall through to walk-in allocation.
      activeReservation = await this.prisma.reservation.findUnique({
        where: { id: identity.reservationId },
        include: { slot: { include: { floor: true } } },
      });

      this.assertReservationCanBeFulfilled(activeReservation, dto.vehicleType);

      if (!driverId && activeReservation.driverId) {
        driverId = activeReservation.driverId;
      }
    }

    // Fallback: look up reservation via driverId if no direct reservation resolved
    if (!activeReservation && driverId) {
      activeReservation = await this.prisma.reservation.findFirst({
        where: {
          driverId,
          vehicleType: dto.vehicleType,
          status: 'active',
        },
        include: { slot: { include: { floor: true } } },
      });

      if (activeReservation) {
        this.assertReservationCanBeFulfilled(activeReservation, dto.vehicleType);
      }
    }

    if (activeReservation) {
      slot = activeReservation.slot;
      reservationId = activeReservation.id;
      allocationStrategy = 'reservation_fulfillment';
      allocationTimeMs = 0;
    } else {
      // 13.2: Allocate slot — throws ConflictException if building is full (Req 1.5)
      const result = await this.allocationService.allocate(dto.vehicleType);
      slot = result.slot;
      allocationStrategy = result.allocationStrategy;
      allocationTimeMs = result.allocationTimeMs;
    }

    // ─── Transaction: slot update + session creation ───────────────────────
    let session: any;
    try {
      session = await this.prisma.$transaction(async (tx) => {
        const expectedStatus = activeReservation ? 'reserved' : 'available';
        const lockedSlot = await tx.$queryRaw<{ id: number; status: string }[]>`
          SELECT id, status FROM slots
          WHERE id = ${slot.id} AND status = ${expectedStatus}::"SlotStatus"
          FOR UPDATE SKIP LOCKED
        `;

        if (!lockedSlot || lockedSlot.length === 0) {
          throw new ConflictException(
            `Slot ${slot.code} is no longer ${expectedStatus}. Please retry.`,
          );
        }

        await tx.slot.update({
          where: { id: slot.id },
          data: { status: 'occupied' },
        });

        if (reservationId) {
          await tx.reservation.update({
            where: { id: reservationId },
            data: { status: 'fulfilled' },
          });
        }

        const sessionId = crypto.randomUUID();
        const sessionCode = this.buildSessionCode(sessionId);

        const qrCode = await QRCode.toDataURL(sessionCode, {
          width: 400,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#000000', light: '#ffffff' },
        });

        const newSession = await tx.parkingSession.create({
          data: {
            id: sessionId,
            licensePlate,
            plateNumberOcr,
            plateNumberConfirmed,
            vehicleId: matchedVehicle?.id ?? null,
            vehicleType: dto.vehicleType,
            slotId: slot.id,
            driverId,
            reservationId,
            checkedInById: staffId,
            qrCode,
            sessionCode,
            ticketGeneratedAt: new Date(),
            allocationStrategy,
            allocationTimeMs,
            // 32: Denormalized metrics for research queries
            floorId: slot.floorId,
            zone: slot.zone,
          } as any,
          include: {
            slot: { include: { floor: true } },
          },
        });

        if (dto.ocrEvidenceId) {
          await (tx as any).ocrEvidence.update({
            where: { id: dto.ocrEvidenceId },
            data: {
              sessionId: newSession.id,
              confirmedPlate: licensePlate,
              vehicleType: dto.vehicleType,
              staffId,
              reservationId,
              checkInTime: newSession.checkInTime,
            },
          });
        }

        return newSession;
      });
    } catch (error) {
      if (this.isPrismaUniqueConstraintError(error)) {
        const duplicateSession = await this.findActiveSessionForPlate(licensePlate);
        if (!this.isActivePlateUniqueConstraintError(error) && !duplicateSession) {
          throw error;
        }

        this.logger.warn(
          `Duplicate active session rejected | licensePlate=${licensePlate} existingSessionId=${duplicateSession?.id ?? 'unknown'} source=db_unique_constraint`,
        );
        throw new ConflictException(
          duplicateSession
            ? `Xe đang trong bãi từ ${this.formatCheckInTime(duplicateSession.checkInTime)}`
            : 'Xe đang có phiên gửi xe chưa check-out',
        );
      }
      throw error;
    }

    if (reservationId) {
      this.logger.log(
        `Check-in with reservation success | reservationId=${reservationId} sessionId=${session.id} licensePlate=${session.licensePlate} slotId=${session.slot.id} staffId=${staffId}`,
      );
    }

    return {
      session: {
        id: session.id,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        status: session.status,
        allocationStrategy: session.allocationStrategy,
        allocationTimeMs: session.allocationTimeMs,
        reservationId: session.reservationId,
        identificationMethod: identity.source,
      },
      slot: {
        id: session.slot.id,
        code: session.slot.code,
        zone: session.slot.zone,
        floor: {
          id: session.slot.floor.id,
          floorNumber: session.slot.floor.floorNumber,
          name: session.slot.floor.name,
        },
      },
      qr_code: session.qrCode ?? null,
      ticket: {
        sessionId: session.id,
        sessionCode: session.sessionCode,
        qrPayload: session.sessionCode,
        qrCode: session.qrCode,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        slotCode: session.slot.code,
        floorName: session.slot.floor.name,
        floorNumber: session.slot.floor.floorNumber,
        zone: session.slot.zone,
        checkInTime: session.checkInTime,
        buildingName: process.env.PBMS_BUILDING_NAME ?? 'PBMS Building',
        gateName: process.env.PBMS_GATE_NAME ?? 'Main Gate',
        ticketGeneratedAt: session.ticketGeneratedAt,
      },
    };
  }

  async scanReservation(token: string) {
    const payload = await this.verifyReservationCheckInToken(token);
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: payload.reservationId },
      include: {
        driver: { select: { id: true, fullName: true, phone: true } },
        slot: { include: { floor: true } },
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
            vehicleType: true,
            subscriptions: {
              where: {
                validFrom: { lte: new Date() },
                validTo: { gte: new Date() },
              },
              orderBy: { validTo: 'desc' },
              take: 1,
            },
          },
        },
        session: {
          include: {
            payment: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException(
        'Khong tim thay reservation. Vui long chuyen sang OCR / walk-in flow.',
      );
    }

    if (!reservation.vehicleId || !reservation.vehicle) {
      throw new ConflictException(
        'Reservation nay chua lien ket xe. Vui long dung OCR / walk-in flow.',
      );
    }

    if (reservation.vehicleId !== payload.vehicleId) {
      throw new ConflictException(
        'QR khong khop voi xe da lien ket. Vui long dung OCR / walk-in flow.',
      );
    }

    if (reservation.status !== 'active') {
      throw new ConflictException(
        this.getReservationCheckInFailureMessage(reservation.status),
      );
    }

    if (reservation.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'QR dat cho da het han. Vui long dung OCR / walk-in flow.',
      );
    }

    if (reservation.slot.status !== 'reserved') {
      throw new ConflictException(
        'Cho do da khong con o trang thai RESERVED. Vui long dung OCR / walk-in flow.',
      );
    }

    return {
      reservationId: reservation.id,
      vehicleId: reservation.vehicle.id,
      plateNumber: reservation.vehicle.plateNumber,
      vehicleType: reservation.vehicle.vehicleType,
      slotId: reservation.slot.id,
      slotCode: reservation.slot.code,
      slotLabel: `${reservation.slot.code} - ${reservation.slot.floor.name}`,
      driverName: reservation.driver.fullName ?? reservation.driver.phone ?? 'Unknown driver',
      paymentBadge: this.getReservationPaymentBadge({
        subscriptionCount: reservation.vehicle.subscriptions.length,
        paymentStatus: reservation.session?.payment?.status ?? null,
      }),
      expiresAt: reservation.expiresAt,
      fallbackAction: 'USE_OCR_WALKIN',
    };
  }

  async confirmReservationCheckIn(reservationId: string, staffId: string) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existingSession = await tx.parkingSession.findUnique({
          where: { reservationId },
          include: {
            slot: { include: { floor: true } },
          },
        });

        if (existingSession) {
          return {
            alreadyCheckedIn: true,
            message: 'Da check-in roi',
            session: this.mapReservationSessionSummary(existingSession),
            slot: this.mapSessionSlot(existingSession.slot),
          };
        }

        const lockedReservation = await tx.$queryRaw<
          Array<{
            id: string;
          }>
        >`
          SELECT id
          FROM reservations
          WHERE id = ${reservationId}
          FOR UPDATE
        `;

        if (lockedReservation.length === 0) {
          throw new NotFoundException(`Reservation not found: ${reservationId}`);
        }

        const reservation = await tx.reservation.findUnique({
          where: { id: reservationId },
          include: {
            driver: { select: { id: true, fullName: true, phone: true } },
            slot: { include: { floor: true } },
            vehicle: { select: { id: true, plateNumber: true, vehicleType: true } },
            session: {
              include: {
                slot: { include: { floor: true } },
              },
            },
          },
        });

        if (!reservation) {
          throw new NotFoundException(`Reservation not found: ${reservationId}`);
        }

        if (reservation.session) {
          return {
            alreadyCheckedIn: true,
            message: 'Da check-in roi',
            session: this.mapReservationSessionSummary(reservation.session),
            slot: this.mapSessionSlot(reservation.session.slot),
          };
        }

        this.assertReservationCanConfirmCheckIn(reservation);

        const lockedSlot = await tx.$queryRaw<{ id: number; status: string }[]>`
          SELECT id, status
          FROM slots
          WHERE id = ${reservation.slotId} AND status = ${'reserved'}::"SlotStatus"
          FOR UPDATE
        `;

        if (lockedSlot.length === 0) {
          throw new ConflictException(
            'Cho do khong con o trang thai RESERVED. Vui long dung OCR / walk-in flow.',
          );
        }

        const conflictingSession = await tx.parkingSession.findFirst({
          where: {
            vehicleId: reservation.vehicleId,
            status: {
              in: ['active', 'checkout_pending', 'exit_authorized'],
            },
          },
          select: {
            id: true,
            checkInTime: true,
          },
        });

        if (conflictingSession) {
          throw new ConflictException(
            `Xe da co phien gui xe dang hoat dong tu ${this.formatCheckInTime(conflictingSession.checkInTime)}`,
          );
        }

        const sessionId = crypto.randomUUID();
        const sessionCode = this.buildSessionCode(sessionId);
        const qrCode = await QRCode.toDataURL(sessionCode, {
          width: 400,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#000000', light: '#ffffff' },
        });

        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'fulfilled' },
        });

        await tx.slot.update({
          where: { id: reservation.slotId },
          data: { status: 'occupied' },
        });

        const session = await tx.parkingSession.create({
          data: {
            id: sessionId,
            driverId: reservation.driverId,
            vehicleId: reservation.vehicleId,
            slotId: reservation.slotId,
            reservationId: reservation.id,
            licensePlate: reservation.vehicle!.plateNumber,
            plateNumberOcr: null,
            plateNumberConfirmed: reservation.vehicle!.plateNumber,
            vehicleType: reservation.vehicle!.vehicleType,
            checkedInById: staffId,
            qrCode,
            sessionCode,
            ticketGeneratedAt: new Date(),
            allocationStrategy: 'reservation_qr_checkin',
            allocationTimeMs: 0,
            floorId: reservation.slot.floorId,
            zone: reservation.slot.zone,
          } as any,
          include: {
            slot: { include: { floor: true } },
          },
        });

        this.logger.log(
          `Reservation QR check-in success | reservationId=${reservation.id} sessionId=${session.id} vehicleId=${reservation.vehicleId} slotId=${reservation.slotId} staffId=${staffId}`,
        );

        return {
          alreadyCheckedIn: false,
          message: 'Check-in thanh cong',
          session: this.mapReservationSessionSummary(session),
          slot: this.mapSessionSlot(session.slot),
        };
      });

      return result;
    } catch (error) {
      if (this.isPrismaUniqueConstraintError(error)) {
        const existingSession = await this.prisma.parkingSession.findUnique({
          where: { reservationId },
          include: {
            slot: { include: { floor: true } },
          },
        });

        if (existingSession) {
          return {
            alreadyCheckedIn: true,
            message: 'Da check-in roi',
            session: this.mapReservationSessionSummary(existingSession),
            slot: this.mapSessionSlot(existingSession.slot),
          };
        }
      }

      throw error;
    }
  }

  private buildSessionCode(sessionId: string): string {
    return `PBMS-${sessionId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  }

  private async verifyReservationCheckInToken(
    token: string,
  ): Promise<ReservationCheckInTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<ReservationCheckInTokenPayload>(token);

      if (
        payload.typ !== RESERVATION_CHECKIN_TOKEN_TYPE ||
        !payload.reservationId ||
        !payload.vehicleId ||
        !payload.driverId
      ) {
        throw new BadRequestException(
          'QR reservation khong hop le. Vui long dung OCR / walk-in flow.',
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'TokenExpiredError'
      ) {
        throw new ConflictException(
          'QR reservation da het han. Vui long quet lai QR moi hoac dung OCR / walk-in flow.',
        );
      }

      throw new BadRequestException(
        'QR reservation khong hop le. Vui long dung OCR / walk-in flow.',
      );
    }
  }

  async issueTicket(sessionId: string, staffId: string) {
    const updated = await (this.prisma as any).parkingSession.update({
      where: { id: sessionId },
      data: {
        ticketIssuedAt: new Date(),
        ticketIssuedByStaffId: staffId,
      },
    });

    return {
      sessionId: updated.id,
      ticketIssuedAt: updated.ticketIssuedAt,
      ticketIssuedByStaffId: updated.ticketIssuedByStaffId,
    };
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private isActivePlateUniqueConstraintError(error: unknown): boolean {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('meta' in error)
    ) {
      return false;
    }

    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    if (Array.isArray(target)) {
      return target.includes('license_plate') || target.includes('licensePlate');
    }

    return target === 'uniq_active_plate' || target === 'license_plate';
  }

  private async findActiveSessionForPlate(licensePlate: string): Promise<{
    id: string;
    checkInTime: Date;
  } | null> {
    return this.prisma.parkingSession.findFirst({
      where: {
        licensePlate,
        status: 'active',
      },
      select: {
        id: true,
        checkInTime: true,
      },
      orderBy: {
        checkInTime: 'asc',
      },
    });
  }

  private formatCheckInTime(value: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(value);
  }

  private mapBreakdownToCheckoutFee(breakdown: FeeBreakdown) {
    return {
      durationHours: breakdown.roundedHours,
      baseFee: breakdown.baseFee,
      penalty: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
      total: breakdown.totalFee,
      isOvertime: breakdown.isOvertime,
      isLostTicket: breakdown.isLostTicket,
      checkOutTime: breakdown.checkOutTime,
    };
  }

  private assertReservationCanBeFulfilled(
    reservation: {
      id: string;
      vehicleType: VehicleType;
      status: string;
      expiresAt?: Date | null;
      slot?: { status?: string } | null;
    } | null,
    vehicleType: VehicleType,
  ): asserts reservation is {
    id: string;
    vehicleType: VehicleType;
    status: string;
    expiresAt?: Date | null;
    slot: { status?: string };
  } {
    if (!reservation) {
      throw new NotFoundException('Active reservation not found');
    }

    if (reservation.status !== 'active') {
      if (reservation.status === 'expired') {
        this.logger.warn(
          `Expired reservation check-in rejected | reservationId=${reservation.id} requestedVehicleType=${vehicleType}`,
        );
      } else {
        this.logger.warn(
          `Reservation check-in rejected | reservationId=${reservation.id} status=${reservation.status} requestedVehicleType=${vehicleType}`,
        );
      }
      throw new ConflictException(
        `Reservation ${reservation.id} is already ${reservation.status}`,
      );
    }

    if (reservation.expiresAt && reservation.expiresAt.getTime() <= Date.now()) {
      this.logger.warn(
        `Expired reservation check-in rejected | reservationId=${reservation.id} expiresAt=${reservation.expiresAt.toISOString()} requestedVehicleType=${vehicleType}`,
      );
      throw new ConflictException(`Reservation ${reservation.id} is expired`);
    }

    if (reservation.vehicleType !== vehicleType) {
      this.logger.warn(
        `Vehicle type mismatch rejected | reservationId=${reservation.id} reservationVehicleType=${reservation.vehicleType} requestedVehicleType=${vehicleType}`,
      );
      throw new ConflictException(
        `Reservation ${reservation.id} is for ${reservation.vehicleType}, not ${vehicleType}`,
      );
    }

    if (!reservation.slot) {
      throw new ConflictException(`Reservation ${reservation.id} has no assigned slot`);
    }

    if (reservation.slot.status && reservation.slot.status !== 'reserved') {
      throw new ConflictException(
        `Reserved slot for reservation ${reservation.id} is ${reservation.slot.status}`,
      );
    }
  }

  private assertReservationCanConfirmCheckIn(
    reservation: {
      id: string;
      vehicleId: string | null;
      vehicle: { id: string; plateNumber: string; vehicleType: VehicleType } | null;
      slot: { status: string | null } | null;
      status: string;
      expiresAt: Date | null;
    },
  ): void {
    if (reservation.status !== 'active') {
      throw new ConflictException(
        this.getReservationCheckInFailureMessage(reservation.status),
      );
    }

    if (reservation.expiresAt && reservation.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'Reservation da het han. Vui long dung OCR / walk-in flow.',
      );
    }

    if (!reservation.vehicleId || !reservation.vehicle) {
      throw new ConflictException(
        'Reservation nay chua lien ket xe. Vui long dung OCR / walk-in flow.',
      );
    }

    if (!reservation.slot || reservation.slot.status !== 'reserved') {
      throw new ConflictException(
        'Cho do khong con o trang thai RESERVED. Vui long dung OCR / walk-in flow.',
      );
    }
  }

  private getReservationCheckInFailureMessage(status: string): string {
    if (status === 'fulfilled') {
      return 'Reservation nay da duoc check-in roi.';
    }

    if (status === 'expired') {
      return 'Reservation da het han. Vui long dung OCR / walk-in flow.';
    }

    if (status === 'cancelled') {
      return 'Reservation da bi huy. Vui long dung OCR / walk-in flow.';
    }

    return `Reservation khong hop le o trang thai ${status}. Vui long dung OCR / walk-in flow.`;
  }

  private getReservationPaymentBadge(input: {
    subscriptionCount: number;
    paymentStatus: string | null;
  }): 'Đã thanh toán' | 'Auto-pay' | 'Thanh toán khi ra' {
    if (input.paymentStatus === 'paid') {
      return 'Đã thanh toán';
    }

    if (input.subscriptionCount > 0) {
      return 'Auto-pay';
    }

    return 'Thanh toán khi ra';
  }

  private mapReservationSessionSummary(session: {
    id: string;
    reservationId: string | null;
    vehicleId: string | null;
    licensePlate: string;
    vehicleType: VehicleType;
    checkInTime: Date;
    status: string;
    sessionCode: string;
  }) {
    return {
      id: session.id,
      reservationId: session.reservationId,
      vehicleId: session.vehicleId,
      licensePlate: session.licensePlate,
      vehicleType: session.vehicleType,
      checkInTime: session.checkInTime,
      status: session.status,
      sessionCode: session.sessionCode,
    };
  }

  private mapSessionSlot(slot: {
    id: number;
    code: string;
    zone: string;
    floor: {
      id: number;
      floorNumber: number;
      name: string;
    };
  }) {
    return {
      id: slot.id,
      code: slot.code,
      zone: slot.zone,
      floor: {
        id: slot.floor.id,
        floorNumber: slot.floor.floorNumber,
        name: slot.floor.name,
      },
    };
  }

  /**
   * 15.1–15.3: Check-out a vehicle.
   *
   * Flow:
   * 1. Lookup active session by session_id (QR) or license_plate
   * 2. Calculate fee breakdown via FeesService
   * 3. If duration > threshold, flag overtime + log warning
   * 4. Move session to checkout_pending and create/update pending payment
   * 5. Return fee breakdown for Staff to confirm
   *
   * Req 2.1–2.3, 5.5
   */
  async checkOut(dto: CheckOutDto, staffId: string) {
    // 15.1: Validate at least one identifier provided
    if (!dto.sessionId && !dto.licensePlate) {
      throw new BadRequestException(
        'Either sessionId or licensePlate must be provided',
      );
    }

    // 15.1: Lookup active session
    const session = await this.prisma.parkingSession.findFirst({
      where: {
        status: 'active',
        ...(dto.sessionId
          ? { OR: [{ id: dto.sessionId }, { sessionCode: dto.sessionId }] }
          : { licensePlate: dto.licensePlate }),
      },
      include: {
        slot: { include: { floor: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(
        `No active session found for ${dto.sessionId ? `id: ${dto.sessionId}` : `plate: ${dto.licensePlate}`}`,
      );
    }

    // 15.2: Calculate fee breakdown via FeesService
    const now = new Date();
    const breakdown = await this.feesService.calculate(session, false, now);

    // 15.3: Flag overtime + log warning if duration > threshold
    if (breakdown.isOvertime) {
      this.logger.warn(
        `Overtime detected: session ${session.id}, plate ${session.licensePlate}, ` +
          `duration ${breakdown.roundedHours}h (threshold exceeded)`,
      );
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.parkingSession.update({
        where: { id: session.id },
        data: {
          status: 'checkout_pending',
          feeAmount: breakdown.baseFee,
          penaltyAmount: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
          isOvertime: breakdown.isOvertime,
          isLostTicket: breakdown.isLostTicket,
        } as any,
      });

      return tx.payment.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          amount: breakdown.totalFee,
          method: PaymentMethod.cash,
          status: 'pending',
          paidAt: null,
          receivedBy: null,
        } as any,
        update: {
          amount: breakdown.totalFee,
          method: PaymentMethod.cash,
          status: 'pending',
          paidAt: null,
          receivedBy: null,
        } as any,
      });
    });

    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        checkOutTime: session.checkOutTime,
        status: 'checkout_pending',
        driverId: session.driverId,
        isPaid: session.isPaid,
        feeAmount: breakdown.baseFee,
        penaltyAmount: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
        isOvertime: breakdown.isOvertime,
        isLostTicket: breakdown.isLostTicket,
      },
      slot: {
        id: session.slot.id,
        code: session.slot.code,
        status: session.slot.status,
        zone: session.slot.zone,
        floor: {
          id: session.slot.floor.id,
          floorNumber: session.slot.floor.floorNumber,
          name: session.slot.floor.name,
        },
      },
      breakdown,
      payment: {
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        status: (payment as any).status,
        paidAt: payment.paidAt,
      },
    };
  }

  /**
   * 15.4–15.6: Confirm payment and authorize exit.
   *
   * Flow:
   * 1. Lookup checkout_pending session by ID
   * 2. Recalculate fee (with lost ticket flag if provided)
   * 3. In transaction: update Payment to paid and session to exit_authorized
   * 4. Return receipt/exit authorization. Slot release happens in confirmExit().
   *
   * Req 2.4, 2.5, 5.5, 6.2, 6.4
   */
  async confirmPayment(
    sessionId: string,
    dto: ConfirmPaymentDto,
    staffId: string,
  ) {
    // Lookup checkout pending session
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      include: {
        slot: { include: { floor: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    if ((session.status as string) !== 'checkout_pending') {
      throw new ConflictException(
        `Session ${sessionId} is already ${session.status}`,
      );
    }

    // Recalculate fee at confirmation time (with lost ticket flag)
    const now = new Date();
    const isLost = dto.isLostTicket ?? false;
    const breakdown = await this.feesService.calculate(session, isLost, now);
    const method = dto.method ?? PaymentMethod.cash;

    // 15.4–15.5: Payment confirmation authorizes exit.
    const result = await this.prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({
        where: { sessionId },
      });

      if (!existingPayment) {
        await tx.payment.create({
          data: {
            sessionId,
            amount: breakdown.totalFee,
            method,
            status: 'pending',
            paidAt: null,
            receivedBy: null,
          } as any,
        });
      }

      const payment = await tx.payment.update({
        where: { sessionId },
        data: {
          amount: breakdown.totalFee,
          method,
          status: 'paid',
          paidAt: now,
          receivedBy: staffId,
        } as any,
      });

      const updatedSession = await tx.parkingSession.update({
        where: { id: sessionId },
        data: {
          status: 'exit_authorized',
          checkedOutById: staffId,
          feeAmount: breakdown.baseFee,
          penaltyAmount: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
          isPaid: true,
          isOvertime: breakdown.isOvertime,
          isLostTicket: isLost,
        } as any,
      });

      return { updatedSession, payment };
    });

    // 15.6: Return receipt (Req 6.4)
    return {
      receipt: {
        sessionId: session.id,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        slot: {
          code: session.slot.code,
          floor: session.slot.floor.name,
        },
        checkInTime: session.checkInTime,
        checkOutTime: now,
        durationHours: breakdown.roundedHours,
        breakdown: {
          hourlyRate: breakdown.hourlyRate,
          roundedHours: breakdown.roundedHours,
          baseFee: breakdown.baseFee,
          isOvertime: breakdown.isOvertime,
          overtimePenalty: breakdown.overtimePenalty,
          isLostTicket: isLost,
          lostTicketPenalty: breakdown.lostTicketPenalty,
          totalFee: breakdown.totalFee,
        },
        payment: {
          id: result.payment.id,
          amount: result.payment.amount,
          method: result.payment.method,
          status: (result.payment as any).status,
          paidAt: result.payment.paidAt,
        },
        exitAuthorizationStatus: result.updatedSession.status,
      },
    };
  }

  /**
   * Flow 4A.1: Staff confirms the vehicle actually exited.
   * This is the only point where the slot is released.
   */
  async confirmExit(sessionId: string, staffId: string) {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      include: {
        slot: { include: { floor: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    if ((session.status as string) !== 'exit_authorized') {
      throw new ConflictException(
        `Session ${sessionId} must be exit_authorized before exit confirmation`,
      );
    }

    const now = new Date();
    const updatedSession = await this.prisma.$transaction(async (tx) => {
      const completed = await tx.parkingSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          checkOutTime: now,
          checkedOutById: staffId,
        } as any,
      });

      await tx.slot.update({
        where: { id: session.slotId },
        data: { status: 'available' },
      });

      return completed;
    });

    return {
      session: {
        id: updatedSession.id,
        status: updatedSession.status,
        checkOutTime: updatedSession.checkOutTime,
        checkedOutById: updatedSession.checkedOutById,
      },
      slot: {
        id: session.slot.id,
        code: session.slot.code,
        status: 'available',
      },
    };
  }

  /**
   * Get a single session by ID.
   * Accessible by Staff and the owning Driver.
   */
  async findOne(id: string) {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id },
      include: {
        slot: { include: { floor: true } },
        driver: { select: { id: true, phone: true, fullName: true } },
        checkedInBy: { select: { id: true, phone: true, fullName: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with id "${id}" not found`);
    }

    return session;
  }

  /**
   * List all currently active sessions.
   * Accessible by Staff.
   */
  async findActive() {
    return this.prisma.parkingSession.findMany({
      where: { status: 'active' },
      include: {
        slot: { include: { floor: true } },
        driver: { select: { id: true, phone: true, fullName: true } },
      },
      orderBy: { checkInTime: 'asc' },
    });
  }

  /**
   * Flow 4A.2: read-only lookup for the Staff checkout workspace.
   * This must not move the session lifecycle forward.
   */
  async lookupForCheckout(input: {
    sessionCode?: string;
    licensePlate?: string;
  }) {
    const sessionCode = input.sessionCode?.trim();
    const licensePlate = input.licensePlate?.trim().toUpperCase();

    if (!sessionCode && !licensePlate) {
      throw new BadRequestException(
        'Either sessionCode or licensePlate must be provided',
      );
    }

    const session = await this.prisma.parkingSession.findFirst({
      where: sessionCode
        ? { OR: [{ id: sessionCode }, { sessionCode }] }
        : { licensePlate },
      include: {
        slot: { include: { floor: true } },
        payment: true,
      },
      orderBy: { checkInTime: 'desc' },
    });

    if (!session) {
      throw new NotFoundException('Không tìm thấy session.');
    }

    const breakdown = await this.feesService.calculate(
      session,
      session.isLostTicket,
      session.checkOutTime ?? new Date(),
    );

    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        checkOutTime: session.checkOutTime,
        status: session.status,
        isPaid: session.isPaid,
        feeAmount: session.feeAmount,
        penaltyAmount: session.penaltyAmount,
        isOvertime: session.isOvertime,
        isLostTicket: session.isLostTicket,
      },
      slot: {
        id: session.slot.id,
        code: session.slot.code,
        status: session.slot.status,
        zone: session.slot.zone,
        floor: {
          id: session.slot.floor.id,
          floorNumber: session.slot.floor.floorNumber,
          name: session.slot.floor.name,
        },
      },
      fee: this.mapBreakdownToCheckoutFee(breakdown),
      payment: session.payment
        ? {
            id: session.payment.id,
            sessionId: session.payment.sessionId,
            amount: session.payment.amount,
            method: session.payment.method,
            status: (session.payment as any).status,
            paidAt: session.payment.paidAt,
            receivedBy: session.payment.receivedBy,
            checkoutUrl: (session.payment as any).checkoutUrl,
            qrCode: (session.payment as any).qrCode,
            expiredAt: (session.payment as any).expiredAt,
          }
        : null,
    };
  }

  /**
   * 23.3 / 23.4: List sessions for a specific driver, filtered by status.
   */
  async findByDriver(driverId: string, status: 'active' | 'completed') {
    return this.prisma.parkingSession.findMany({
      where: { driverId, status },
      include: {
        slot: { include: { floor: true } },
      },
      orderBy: { checkInTime: 'desc' },
    });
  }

  /**
   * 21: Get QR code for a session.
   * Returns the stored base64 data URL, or generates one if missing.
   * Accessible by Staff and the owning Driver.
   */
  async getQrCode(sessionId: string) {
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      select: { id: true, sessionCode: true, qrCode: true, driverId: true },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    // If QR was already generated at check-in, return it
    if (session.qrCode) {
      return { sessionId: session.id, sessionCode: session.sessionCode, qrCode: session.qrCode };
    }

    // Generate QR on-demand (for sessions that didn't have a registered driver at check-in)
    const qrPayload = session.sessionCode ?? sessionId;
    const qrCode = await QRCode.toDataURL(qrPayload, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    });

    // Persist for future requests
    await this.prisma.parkingSession.update({
      where: { id: sessionId },
      data: { qrCode },
    });

    return { sessionId: session.id, sessionCode: session.sessionCode, qrCode };
  }

  /**
   * 24.1–24.3: Handle lost ticket.
   *
   * Flow:
   * 1. Lookup active session by license plate
   * 2. Record ID verification info (id_card_no, driver_license_no)
   * 3. Set isLostTicket flag on session
   * 4. Calculate fee with lost ticket penalty
   * 5. Return fee breakdown for staff to confirm payment
   *
   * Req 5.6, 7.3
   */
  async handleLostTicket(dto: LostTicketDto, staffId: string) {
    // 24.2: Lookup active session by plate
    const session = await this.prisma.parkingSession.findFirst({
      where: {
        licensePlate: dto.licensePlate,
        status: 'active',
      },
      include: {
        slot: { include: { floor: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(
        `Không tìm thấy phiên gửi xe cho biển số: ${dto.licensePlate}`,
      );
    }

    // 24.2: Set lost ticket flag and record ID info
    await this.prisma.parkingSession.update({
      where: { id: session.id },
      data: {
        isLostTicket: true,
        idCardNo: dto.idCardNo,
        driverLicenseNo: dto.driverLicenseNo,
      },
    });

    // 24.3: Calculate fee with lost ticket penalty (100k)
    const now = new Date();
    const breakdown = await this.feesService.calculate(session, true, now);

    this.logger.warn(
      `Lost ticket processed: session ${session.id}, plate ${dto.licensePlate}, ` +
        `ID card: ${dto.idCardNo}, staff: ${staffId}`,
    );

    return {
      session: {
        id: session.id,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        isLostTicket: true,
      },
      slot: {
        code: session.slot.code,
        floor: session.slot.floor.name,
      },
      breakdown,
    };
  }
}
