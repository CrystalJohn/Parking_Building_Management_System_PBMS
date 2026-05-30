import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { VehicleType, PaymentMethod } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from '../slots/allocation.service';
import { FeesService, FeeBreakdown } from '../fees/fees.service';
import { CheckInDto, CheckOutDto, ConfirmPaymentDto, LostTicketDto } from './dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly feesService: FeesService,
  ) {}

  /**
   * 13.1–13.6 + Task 20: Check-in a vehicle.
   *
   * Flow:
   * 1. Validate no active session already exists for this plate
   * 2. Optionally resolve registered driver by phone
   * 3. [Task 20] If driver has an active reservation for this vehicleType → fulfill it
   *    (use reserved slot, skip allocation)
   * 4. Otherwise allocate a slot via AllocationService (BalancedOccupancyStrategy)
   * 5. Inside a transaction: update slot → occupied, create ParkingSession,
   *    optionally fulfill reservation
   * 6. If driver is registered, generate a QR code (UUID encoded)
   * 7. Return session + slot + optional QR code
   *
   * Req 1.1–1.5, 3.6, 8
   */
  async checkIn(dto: CheckInDto, staffId: string) {
    // Check for duplicate active session with same license plate
    const existingSession = await this.prisma.parkingSession.findFirst({
      where: {
        licensePlate: dto.licensePlate,
        status: 'active',
      },
      select: { id: true, licensePlate: true },
    });

    if (existingSession) {
      throw new ConflictException(
        `Biển số ${dto.licensePlate} đang có phiên gửi xe chưa check-out`,
      );
    }

    // Resolve registered driver (optional)
    let driverId: string | null = null;
    if (dto.driverPhone) {
      const driver = await this.prisma.user.findUnique({
        where: { phone: dto.driverPhone },
        select: { id: true, isActive: true },
      });
      // Only link if driver exists and is active; silently ignore otherwise
      if (driver?.isActive) {
        driverId = driver.id;
      }
    }

    // ─── Task 20: Check for active reservation ────────────────────────────
    // If the driver has an active reservation for this vehicle type,
    // fulfill it instead of allocating a new slot.
    let reservationId: string | null = null;
    let slot: { id: number; code: string; zone: any; floor: any; floorId: number; slotNumber: number; status: any; vehicleType: any };
    let allocationStrategy: string;
    let allocationTimeMs: number;

    const activeReservation = driverId
      ? await this.prisma.reservation.findFirst({
          where: {
            driverId,
            vehicleType: dto.vehicleType,
            status: 'active',
          },
          include: { slot: { include: { floor: true } } },
        })
      : null;

    if (activeReservation) {
      // Use the reserved slot — no allocation needed
      slot = activeReservation.slot;
      reservationId = activeReservation.id;
      allocationStrategy = 'reservation_fulfillment';
      allocationTimeMs = 0;
    } else {
      // 13.2: Allocate slot (measures allocation_time_ms internally)
      // ConflictException is thrown here if building is full (Req 1.5)
      const result = await this.allocationService.allocate(dto.vehicleType);
      slot = result.slot;
      allocationStrategy = result.allocationStrategy;
      allocationTimeMs = result.allocationTimeMs;
    }

    // Wrap slot update + session creation in a transaction with
    // FOR UPDATE SKIP LOCKED to prevent concurrent double-assignment.
    const session = await this.prisma.$transaction(async (tx) => {
      // Re-check the slot is still available/reserved and lock it
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

      // Update slot → occupied (from available or reserved)
      await tx.slot.update({
        where: { id: slot.id },
        data: { status: 'occupied' },
      });

      // Task 20: Fulfill reservation if present
      if (reservationId) {
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'fulfilled' },
        });
      }

      // Generate QR code for registered drivers
      let qrCode: string | null = null;
      const sessionId = crypto.randomUUID();

      if (driverId) {
        qrCode = await QRCode.toDataURL(sessionId, {
          width: 400,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#000000', light: '#ffffff' },
        });
      }

      // Create parking session (linked to reservation if applicable)
      const newSession = await tx.parkingSession.create({
        data: {
          id: sessionId,
          licensePlate: dto.licensePlate,
          vehicleType: dto.vehicleType,
          slotId: slot.id,
          driverId,
          reservationId,
          checkedInById: staffId,
          qrCode,
          allocationStrategy,
          allocationTimeMs,
          // 32: Denormalized metrics for research queries
          floorId: slot.floorId,
          zone: slot.zone,
        },
        include: {
          slot: { include: { floor: true } },
        },
      });

      return newSession;
    });

    // Return session + slot + optional QR
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
    };
  }

  /**
   * 15.1–15.3: Check-out a vehicle.
   *
   * Flow:
   * 1. Lookup active session by session_id (QR) or license_plate
   * 2. Calculate fee breakdown via FeesService
   * 3. If duration > threshold, flag overtime + log warning
   * 4. Return fee breakdown for Staff to confirm
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
          ? { id: dto.sessionId }
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

    return {
      session: {
        id: session.id,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        status: session.status,
        driverId: session.driverId,
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
      breakdown,
    };
  }

  /**
   * 15.4–15.6: Confirm payment and complete check-out.
   *
   * Flow:
   * 1. Lookup active session by ID
   * 2. Recalculate fee (with lost ticket flag if provided)
   * 3. In transaction: update session (completed, fees, overtime, lost), create Payment, release slot
   * 4. Return receipt
   *
   * Req 2.4, 2.5, 5.5, 6.2, 6.4
   */
  async confirmPayment(
    sessionId: string,
    dto: ConfirmPaymentDto,
    staffId: string,
  ) {
    // Lookup active session
    const session = await this.prisma.parkingSession.findUnique({
      where: { id: sessionId },
      include: {
        slot: { include: { floor: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'active') {
      throw new ConflictException(
        `Session ${sessionId} is already ${session.status}`,
      );
    }

    // Recalculate fee at confirmation time (with lost ticket flag)
    const now = new Date();
    const isLost = dto.isLostTicket ?? false;
    const breakdown = await this.feesService.calculate(session, isLost, now);
    const method = dto.method ?? PaymentMethod.cash;

    // 15.4–15.5: Transaction — update session, create payment, release slot
    const result = await this.prisma.$transaction(async (tx) => {
      // Update session to completed
      const updatedSession = await tx.parkingSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          checkOutTime: now,
          checkedOutById: staffId,
          feeAmount: breakdown.baseFee,
          penaltyAmount: breakdown.overtimePenalty + breakdown.lostTicketPenalty,
          isPaid: true,
          isOvertime: breakdown.isOvertime,
          isLostTicket: isLost,
        },
      });

      // 15.4: Create Payment record (Req 6.2)
      const payment = await tx.payment.create({
        data: {
          sessionId,
          amount: breakdown.totalFee,
          method,
          receivedBy: staffId,
        },
      });

      // 15.5: Release slot → available (Req 2.5)
      await tx.slot.update({
        where: { id: session.slotId },
        data: { status: 'available' },
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
          paidAt: result.payment.paidAt,
        },
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
      select: { id: true, qrCode: true, driverId: true },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    // If QR was already generated at check-in, return it
    if (session.qrCode) {
      return { sessionId: session.id, qrCode: session.qrCode };
    }

    // Generate QR on-demand (for sessions that didn't have a registered driver at check-in)
    const qrCode = await QRCode.toDataURL(sessionId, {
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

    return { sessionId: session.id, qrCode };
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
