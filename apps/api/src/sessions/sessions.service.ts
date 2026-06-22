import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma, VehicleType, PaymentMethod } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from '../slots/allocation.service';
import { FeesService, FeeBreakdown } from '../fees/fees.service';
import { VehicleIdentificationService } from '../vehicle-identification/vehicle-identification.service';
import type { VehicleIdentityResult } from '../vehicle-identification/vehicle-identity.types';
import { CheckInDto, CheckOutDto, ConfirmPaymentDto, LostTicketDto } from './dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly feesService: FeesService,
    private readonly vehicleIdentificationService: VehicleIdentificationService,
  ) {}

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

    // Check for duplicate active session with same license plate
    const existingSession = await this.prisma.parkingSession.findFirst({
      where: { licensePlate, status: 'active' },
      select: { id: true, licensePlate: true },
    });

    if (existingSession) {
      this.logger.warn(
        `Duplicate active session rejected | licensePlate=${licensePlate} existingSessionId=${existingSession.id}`,
      );
      throw new ConflictException(
        `Biển số ${licensePlate} đang có phiên gửi xe chưa check-out`,
      );
    }

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
        this.logger.warn(
          `Duplicate active session rejected | licensePlate=${licensePlate} source=db_unique_constraint`,
        );
        throw new ConflictException(
          'Duplicate active parking session detected for this license plate',
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

  private buildSessionCode(sessionId: string): string {
    return `PBMS-${sessionId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
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
