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
import { CheckInDto, CheckOutDto, ConfirmPaymentDto } from './dto';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly feesService: FeesService,
  ) {}

  /**
   * 13.1–13.6: Check-in a vehicle.
   *
   * Flow:
   * 1. Validate no active session already exists for this plate (unique partial index)
   * 2. Optionally resolve registered driver by phone
   * 3. Allocate a slot via AllocationService (BalancedOccupancyStrategy)
   * 4. Inside a transaction: update slot → occupied, create ParkingSession
   * 5. If driver is registered, generate a QR code (UUID encoded)
   * 6. Return session + slot + optional QR code
   *
   * Req 1.1–1.5, 3.6
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

    // 13.2: Allocate slot (measures allocation_time_ms internally)
    // ConflictException is thrown here if building is full (Req 1.5)
    const { slot, allocationStrategy, allocationTimeMs } =
      await this.allocationService.allocate(dto.vehicleType);

    // 13.2: Wrap slot update + session creation in a transaction with
    // FOR UPDATE SKIP LOCKED to prevent concurrent double-assignment.
    const session = await this.prisma.$transaction(async (tx) => {
      // Re-check the slot is still available and lock it
      const lockedSlot = await tx.$queryRaw<{ id: number; status: string }[]>`
        SELECT id, status FROM slots
        WHERE id = ${slot.id} AND status = 'available'
        FOR UPDATE SKIP LOCKED
      `;

      if (!lockedSlot || lockedSlot.length === 0) {
        // Slot was taken between allocation query and transaction — retry by
        // throwing ConflictException so the caller can retry or surface the error.
        throw new ConflictException(
          `Slot ${slot.code} is no longer available. Please retry.`,
        );
      }

      // 13.3: Update slot → occupied
      await tx.slot.update({
        where: { id: slot.id },
        data: { status: 'occupied' },
      });

      // 13.4: Generate QR code for registered drivers
      let qrCode: string | null = null;
      // We need the session UUID first — generate it before creating the record
      const sessionId = crypto.randomUUID();

      if (driverId) {
        // Encode session UUID as QR (base64 PNG data URL)
        qrCode = await QRCode.toDataURL(sessionId);
      }

      // 13.3 + 13.5: Create parking session
      const newSession = await tx.parkingSession.create({
        data: {
          id: sessionId,
          licensePlate: dto.licensePlate,
          vehicleType: dto.vehicleType,
          slotId: slot.id,
          driverId,
          checkedInById: staffId,
          qrCode,
          // 13.5: Log allocation metadata
          allocationStrategy,
          allocationTimeMs,
        },
        include: {
          slot: { include: { floor: true } },
        },
      });

      return newSession;
    });

    // 13.6: Return session + slot + optional QR
    return {
      session: {
        id: session.id,
        licensePlate: session.licensePlate,
        vehicleType: session.vehicleType,
        checkInTime: session.checkInTime,
        status: session.status,
        allocationStrategy: session.allocationStrategy,
        allocationTimeMs: session.allocationTimeMs,
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
}
