import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from '../slots/allocation.service';
import { CheckInDto } from './dto';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
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
